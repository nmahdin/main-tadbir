<?php

namespace App\Core\Invitations;

use App\Core\Audit\AuditWriter;
use App\Core\Identity\AccountStatus;
use App\Core\Organizations\Organization;
use App\Core\Rbac\GrantCeiling;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Invitation issuance and revocation (Stage C6-1).
 *
 * Scope of this stage: persistence, secure single-use tokens,
 * deterministic expiry evaluation, role intent with Grant
 * Ceiling, duplicate-pending conflict, and authorized revocation.
 * Acceptance (membership creation) is C6-2 and is deliberately
 * NOT implemented here — nothing in this service creates
 * memberships, enables modules, or grants platform privileges.
 *
 * Authorization model (no new permission keys invented):
 *  - organization invitations require the actor's effective
 *    organization permission `organization.members.manage` in
 *    exactly that organization;
 *  - workspace invitations require `workspace.members.manage`
 *    in exactly that workspace (for organization-owned workspaces
 *    the platform MembershipPermissions resolver already demands
 *    active organization membership + an operational organization).
 * Platform/Legacy Admin status confers nothing here.
 *
 * Role intent: the intended role must exist, belong to the same
 * scope container, and its permission set must fit within the
 * actor's effective permissions (Grant Ceiling). Inviter and
 * role validity are re-evaluated inside the issuance transaction
 * and must be re-evaluated again at acceptance (C6-2): if the
 * inviter loses authority or the role drifts, acceptance fails
 * closed.
 *
 * Duplicate rule (deterministic): an *effective* pending
 * invitation (pending and not yet expired) for the same scope,
 * normalized email, and intended role rejects a new issue with
 * `invitation_duplicate_pending`. An expired leftover never
 * blocks reissue; a valid pending invitation is never silently
 * revoked or replaced (resend/replacement workflows are later
 * stages).
 *
 * Expiry: default 7 days; an explicit override must lie within
 * (now, now + 30 days]. Expiry is evaluated, never rewritten by a
 * job: `pending && now >= expires_at` is effectively expired.
 * A token is consumed only by successful acceptance (C6-2) —
 * lookups here (resolveByRawToken) never mutate state.
 */
final class InvitationService
{
    public const ORGANIZATION_INVITE_PERMISSION = 'organization.members.manage';

    public const WORKSPACE_INVITE_PERMISSION = 'workspace.members.manage';

    public const DEFAULT_VALIDITY_DAYS = 7;

    public const MAX_VALIDITY_DAYS = 30;

    public function __construct(
        private readonly MembershipPermissions $permissions,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * @throws InvitationException
     */
    public function issueOrganizationInvitation(
        User $actor,
        Organization $organization,
        string $email,
        int $intendedRoleId,
        ?CarbonImmutable $expiresAt = null,
    ): IssuedInvitation {
        $normalizedEmail = EmailNormalizer::normalize($email);

        return DB::transaction(function () use ($actor, $organization, $normalizedEmail, $intendedRoleId, $expiresAt): IssuedInvitation {
            $lockedOrganization = Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $this->assertOrganizationOperational($lockedOrganization);

            $actorKeys = $this->permissions->organizationPermissionKeys($actor, $lockedOrganization);
            $this->assertInviter($actor, $actorKeys, self::ORGANIZATION_INVITE_PERMISSION);

            $role = $this->resolveIntendedRole($intendedRoleId, 'organization', (int) $lockedOrganization->id, null);
            $this->assertWithinCeiling($actorKeys, $role, 'organization');
            $expiry = $this->resolveExpiry($expiresAt);

            $this->assertNoEffectiveDuplicate(CoreInvitation::TYPE_ORGANIZATION, (int) $lockedOrganization->id, null, $normalizedEmail, (int) $role->id);

            return $this->persist($actor, CoreInvitation::TYPE_ORGANIZATION, $lockedOrganization, null, $normalizedEmail, $role, $expiry);
        });
    }

    /**
     * @throws InvitationException
     */
    public function issueWorkspaceInvitation(
        User $actor,
        Workspace $workspace,
        string $email,
        int $intendedRoleId,
        ?CarbonImmutable $expiresAt = null,
    ): IssuedInvitation {
        $normalizedEmail = EmailNormalizer::normalize($email);

        return DB::transaction(function () use ($actor, $workspace, $normalizedEmail, $intendedRoleId, $expiresAt): IssuedInvitation {
            // Owning organization (if any) derives from the
            // persisted workspace row — never from client input.
            $organization = $workspace->organization_id !== null
                ? Organization::query()->whereKey($workspace->organization_id)->lockForUpdate()->first()
                : null;

            if ($organization !== null) {
                $this->assertOrganizationOperational($organization);
            }

            $lockedWorkspace = Workspace::query()->whereKey($workspace->id)->lockForUpdate()->firstOrFail();

            $actorKeys = $this->permissions->workspacePermissionKeys($actor, $lockedWorkspace);
            $this->assertInviter($actor, $actorKeys, self::WORKSPACE_INVITE_PERMISSION);

            $role = $this->resolveIntendedRole($intendedRoleId, 'workspace', null, (int) $lockedWorkspace->id);
            $this->assertWithinCeiling($actorKeys, $role, 'workspace');
            $expiry = $this->resolveExpiry($expiresAt);

            $this->assertNoEffectiveDuplicate(CoreInvitation::TYPE_WORKSPACE, null, (int) $lockedWorkspace->id, $normalizedEmail, (int) $role->id);

            return $this->persist($actor, CoreInvitation::TYPE_WORKSPACE, null, $lockedWorkspace, $normalizedEmail, $role, $expiry);
        });
    }

    /**
     * Revoke a pending invitation. Terminal states are refused
     * with stable codes; revocation of an expired-but-pending row
     * is allowed and wins over expiry (the row stays revoked
     * forever). Revocation never touches memberships.
     *
     * @throws InvitationException
     */
    public function revoke(User $actor, CoreInvitation $invitation): CoreInvitation
    {
        return DB::transaction(function () use ($actor, $invitation): CoreInvitation {
            $locked = CoreInvitation::query()->whereKey($invitation->id)->lockForUpdate()->first();

            if ($locked === null) {
                throw new InvitationException('invitation_not_found', 'The invitation no longer exists.');
            }

            if ($locked->status === CoreInvitation::STATUS_ACCEPTED) {
                throw new InvitationException('invitation_already_accepted', 'An accepted invitation cannot be revoked.');
            }

            if ($locked->status === CoreInvitation::STATUS_REVOKED) {
                throw new InvitationException('invitation_already_revoked', 'The invitation has already been revoked.');
            }

            if ($locked->isOrganizationScoped()) {
                $organization = Organization::query()->whereKey($locked->organization_id)->lockForUpdate()->firstOrFail();
                $this->assertOrganizationOperational($organization);
                $actorKeys = $this->permissions->organizationPermissionKeys($actor, $organization);
                $this->assertInviter($actor, $actorKeys, self::ORGANIZATION_INVITE_PERMISSION);
                $scopeType = 'organization';
                $scopeId = (int) $organization->id;
            } else {
                $workspace = Workspace::query()->whereKey($locked->workspace_id)->lockForUpdate()->firstOrFail();
                $organization = $workspace->organization_id !== null
                    ? Organization::query()->whereKey($workspace->organization_id)->first()
                    : null;

                if ($organization !== null) {
                    $this->assertOrganizationOperational($organization);
                }

                $actorKeys = $this->permissions->workspacePermissionKeys($actor, $workspace);
                $this->assertInviter($actor, $actorKeys, self::WORKSPACE_INVITE_PERMISSION);
                $scopeType = 'workspace';
                $scopeId = (int) $workspace->id;
            }

            $locked->forceFill([
                'status' => CoreInvitation::STATUS_REVOKED,
                'revoked_at' => CarbonImmutable::now('UTC'),
                'revoked_by_user_id' => $actor->id,
                'status_version' => (int) $locked->status_version + 1,
            ])->save();

            $this->audit->record($actor, 'invitation.revoked', [
                'invitation_id' => (int) $locked->id,
                'type' => $locked->type,
                'intended_role_id' => (int) $locked->intended_role_id,
            ], $scopeType, $scopeId, 'invitation', (int) $locked->id);

            return $locked;
        });
    }

    /**
     * Read-only lookup by raw token (C6-2 acceptance starts here).
     * A lookup NEVER consumes or mutates the invitation.
     */
    public function resolveByRawToken(string $rawToken): ?CoreInvitation
    {
        if (trim($rawToken) === '') {
            return null;
        }

        return CoreInvitation::query()->where('token_hash', InvitationToken::hash($rawToken))->first();
    }

    public function effectiveState(CoreInvitation $invitation, ?CarbonImmutable $now = null): InvitationState
    {
        return $invitation->effectiveState($now);
    }

    private function persist(
        User $actor,
        string $type,
        ?Organization $organization,
        ?Workspace $workspace,
        string $normalizedEmail,
        ScopedRole $role,
        CarbonImmutable $expiresAt,
    ): IssuedInvitation {
        $rawToken = InvitationToken::generate();

        $invitation = CoreInvitation::create([
            'type' => $type,
            'organization_id' => $organization?->id,
            'workspace_id' => $workspace?->id,
            'email_normalized' => $normalizedEmail,
            'token_hash' => InvitationToken::hash($rawToken),
            'status' => CoreInvitation::STATUS_PENDING,
            'intended_role_id' => $role->id,
            'invited_by_user_id' => $actor->id,
            'expires_at' => $expiresAt,
            'status_version' => 1,
        ]);

        $this->audit->record($actor, 'invitation.issued', [
            'invitation_id' => (int) $invitation->id,
            'type' => $type,
            'intended_role_id' => (int) $role->id,
            'expires_at' => $expiresAt->toIso8601String(),
        ], $type === CoreInvitation::TYPE_ORGANIZATION ? 'organization' : 'workspace',
            $type === CoreInvitation::TYPE_ORGANIZATION ? (int) $organization->id : (int) $workspace->id,
            'invitation', (int) $invitation->id);

        return new IssuedInvitation($invitation, $rawToken);
    }

    /**
     * @param  list<string>  $actorKeys
     *
     * @throws InvitationException
     */
    private function assertInviter(User $actor, array $actorKeys, string $permission): void
    {
        $operational = AccountStatus::of($actor->status)?->allowsOperationalAccess() ?? false;

        if (! $operational || ! in_array($permission, $actorKeys, true)) {
            throw new InvitationException('invitation_forbidden', 'The actor lacks invitation authority in this scope.');
        }
    }

    /**
     * @throws InvitationException
     */
    private function assertOrganizationOperational(Organization $organization): void
    {
        if (! $organization->isActive()) {
            throw new InvitationException('invitation_organization_unavailable', 'The organization is not operational, so invitations cannot be issued or changed.');
        }
    }

    /**
     * @throws InvitationException
     */
    private function resolveIntendedRole(int $roleId, string $scope, ?int $organizationId, ?int $workspaceId): ScopedRole
    {
        $role = ScopedRole::query()->find($roleId);

        if ($role === null) {
            throw new InvitationException('invitation_role_invalid', 'The intended role does not exist.');
        }

        $matches = $role->scope === $scope
            && ($organizationId === null || (int) $role->organization_id === $organizationId)
            && ($workspaceId === null || (int) $role->workspace_id === $workspaceId);

        if (! $matches) {
            throw new InvitationException('invitation_role_scope_mismatch', 'The intended role does not belong to the invitation scope.');
        }

        return $role;
    }

    /**
     * @param  list<string>  $actorKeys
     *
     * @throws InvitationException
     */
    private function assertWithinCeiling(array $actorKeys, ScopedRole $role, string $scopeLabel): void
    {
        try {
            GrantCeiling::assertWithinCeiling($actorKeys, $role->permissionKeys(), $scopeLabel);
        } catch (RbacValidationException $exception) {
            throw new InvitationException('invitation_grant_ceiling', $exception->getMessage());
        }
    }

    /**
     * @throws InvitationException
     */
    private function resolveExpiry(?CarbonImmutable $expiresAt): CarbonImmutable
    {
        $now = CarbonImmutable::now('UTC');

        if ($expiresAt === null) {
            return $now->addDays(self::DEFAULT_VALIDITY_DAYS);
        }

        if ($expiresAt->lte($now) || $expiresAt->gt($now->addDays(self::MAX_VALIDITY_DAYS))) {
            throw new InvitationException('invitation_expiry_invalid', 'Invitation expiry must be in the future and at most '.self::MAX_VALIDITY_DAYS.' days out.');
        }

        return $expiresAt;
    }

    /**
     * @throws InvitationException
     */
    private function assertNoEffectiveDuplicate(string $type, ?int $organizationId, ?int $workspaceId, string $normalizedEmail, int $roleId): void
    {
        $query = CoreInvitation::query()
            ->where('type', $type)
            ->where('email_normalized', $normalizedEmail)
            ->where('intended_role_id', $roleId)
            ->where('status', CoreInvitation::STATUS_PENDING);

        if ($type === CoreInvitation::TYPE_ORGANIZATION) {
            $query->where('organization_id', $organizationId);
        } else {
            $query->where('workspace_id', $workspaceId);
        }

        $now = CarbonImmutable::now('UTC');

        foreach ($query->get() as $existing) {
            if ($existing->isAcceptanceEligible($now)) {
                throw new InvitationException('invitation_duplicate_pending', 'A pending invitation already exists for this email, scope, and role.');
            }
        }
    }
}
