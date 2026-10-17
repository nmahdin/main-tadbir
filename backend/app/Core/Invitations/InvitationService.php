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
 * Invitation issuance and revocation (Stage C6-1, amended C6
 * contract: organization / workspace / combined intents).
 *
 * Acceptance (membership creation) is C6-2 and is deliberately
 * NOT implemented here — this service never creates memberships,
 * enables modules, or grants platform privileges. Opening or
 * looking up an invitation never consumes it (see
 * resolveByRawToken); consumption happens only through a
 * successful authenticated C6-2 acceptance.
 *
 * Authorization model (no new permission keys invented):
 *  - organization invitations require the actor's effective
 *    organization permission `organization.members.manage` in
 *    exactly that organization;
 *  - workspace invitations require `workspace.members.manage` in
 *    exactly that workspace (for organization-owned workspaces
 *    the platform MembershipPermissions resolver already demands
 *    active organization membership + an operational
 *    organization);
 *  - combined invitations require BOTH authorities, each
 *    independently, in the workspace's owning organization and in
 *    the workspace itself.
 * Platform/Legacy Admin status confers nothing here.
 *
 * Role intent: each intended role must exist, belong to its own
 * scope container, and fit within the actor's effective
 * permissions FOR THAT SCOPE (Grant Ceiling checked independently
 * per scope for combined). If the inviter loses authority or a
 * role drifts before acceptance, C6-2 acceptance revalidation
 * fails closed — intent recorded here is exactly what C6-2
 * revalidates.
 *
 * Combined + existing organization membership (C6-2 contract): a
 * user who already holds organization membership keeps their
 * existing organization role at acceptance; the stored
 * organization role intent never silently replaces or elevates it.
 *
 * Duplicate rule (deterministic): an *effective* pending
 * invitation (pending and not yet expired) for the same intent,
 * scope, normalized email, and role intent(s) rejects a new issue
 * with `invitation_duplicate_pending`. An expired leftover never
 * blocks reissue; a valid pending invitation is never silently
 * revoked or replaced.
 *
 * Expiry: default 7 days; an explicit override must lie within
 * (now, now + 30 days]. Expiry is evaluated, never rewritten.
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
        int $intendedOrganizationRoleId,
        ?string $message = null,
        ?CarbonImmutable $expiresAt = null,
    ): IssuedInvitation {
        $normalizedEmail = EmailNormalizer::normalize($email);
        $message = $this->normalizeMessage($message);

        return DB::transaction(function () use ($actor, $organization, $normalizedEmail, $intendedOrganizationRoleId, $message, $expiresAt): IssuedInvitation {
            $lockedOrganization = Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $this->assertOrganizationOperational($lockedOrganization);

            $actorKeys = $this->permissions->organizationPermissionKeys($actor, $lockedOrganization);
            $this->assertInviter($actor, $actorKeys, self::ORGANIZATION_INVITE_PERMISSION);

            $role = $this->resolveIntendedRole($intendedOrganizationRoleId, 'organization', (int) $lockedOrganization->id, null);
            $this->assertWithinCeiling($actorKeys, $role, 'organization');
            $expiry = $this->resolveExpiry($expiresAt);

            $this->assertNoEffectiveDuplicate(CoreInvitation::TYPE_ORGANIZATION, (int) $lockedOrganization->id, null, $normalizedEmail, (int) $role->id, null);

            return $this->persist($actor, CoreInvitation::TYPE_ORGANIZATION, $lockedOrganization, null, $normalizedEmail, $role, null, $message, $expiry);
        });
    }

    /**
     * @throws InvitationException
     */
    public function issueWorkspaceInvitation(
        User $actor,
        Workspace $workspace,
        string $email,
        int $intendedWorkspaceRoleId,
        ?string $message = null,
        ?CarbonImmutable $expiresAt = null,
    ): IssuedInvitation {
        $normalizedEmail = EmailNormalizer::normalize($email);
        $message = $this->normalizeMessage($message);

        return DB::transaction(function () use ($actor, $workspace, $normalizedEmail, $intendedWorkspaceRoleId, $message, $expiresAt): IssuedInvitation {
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

            $role = $this->resolveIntendedRole($intendedWorkspaceRoleId, 'workspace', null, (int) $lockedWorkspace->id);
            $this->assertWithinCeiling($actorKeys, $role, 'workspace');
            $expiry = $this->resolveExpiry($expiresAt);

            $this->assertNoEffectiveDuplicate(CoreInvitation::TYPE_WORKSPACE, null, (int) $lockedWorkspace->id, $normalizedEmail, null, (int) $role->id);

            return $this->persist($actor, CoreInvitation::TYPE_WORKSPACE, null, $lockedWorkspace, $normalizedEmail, null, $role, $message, $expiry);
        });
    }

    /**
     * Combined invitation: one token, two role intents, two
     * independent authorities and two independent Grant Ceilings.
     * Only valid for organization-owned workspaces; the
     * organization is derived from the persisted workspace.
     *
     * @throws InvitationException
     */
    public function issueCombinedInvitation(
        User $actor,
        Workspace $workspace,
        string $email,
        int $intendedOrganizationRoleId,
        int $intendedWorkspaceRoleId,
        ?string $message = null,
        ?CarbonImmutable $expiresAt = null,
    ): IssuedInvitation {
        $normalizedEmail = EmailNormalizer::normalize($email);
        $message = $this->normalizeMessage($message);

        return DB::transaction(function () use ($actor, $workspace, $normalizedEmail, $intendedOrganizationRoleId, $intendedWorkspaceRoleId, $message, $expiresAt): IssuedInvitation {
            if ($workspace->organization_id === null) {
                throw new InvitationException('invitation_scope_invalid', 'Combined invitations require an organization-owned workspace.');
            }

            $organization = Organization::query()->whereKey($workspace->organization_id)->lockForUpdate()->firstOrFail();
            $this->assertOrganizationOperational($organization);

            $lockedWorkspace = Workspace::query()->whereKey($workspace->id)->lockForUpdate()->firstOrFail();

            if ((int) $lockedWorkspace->organization_id !== (int) $organization->id) {
                throw new InvitationException('invitation_scope_invalid', 'The workspace does not belong to the organization.');
            }

            $organizationKeys = $this->permissions->organizationPermissionKeys($actor, $organization);
            $this->assertInviter($actor, $organizationKeys, self::ORGANIZATION_INVITE_PERMISSION);
            $workspaceKeys = $this->permissions->workspacePermissionKeys($actor, $lockedWorkspace);
            $this->assertInviter($actor, $workspaceKeys, self::WORKSPACE_INVITE_PERMISSION);

            $organizationRole = $this->resolveIntendedRole($intendedOrganizationRoleId, 'organization', (int) $organization->id, null);
            $workspaceRole = $this->resolveIntendedRole($intendedWorkspaceRoleId, 'workspace', null, (int) $lockedWorkspace->id);
            $this->assertWithinCeiling($organizationKeys, $organizationRole, 'organization');
            $this->assertWithinCeiling($workspaceKeys, $workspaceRole, 'workspace');
            $expiry = $this->resolveExpiry($expiresAt);

            $this->assertNoEffectiveDuplicate(CoreInvitation::TYPE_COMBINED, (int) $organization->id, (int) $lockedWorkspace->id, $normalizedEmail, (int) $organizationRole->id, (int) $workspaceRole->id);

            return $this->persist($actor, CoreInvitation::TYPE_COMBINED, $organization, $lockedWorkspace, $normalizedEmail, $organizationRole, $workspaceRole, $message, $expiry);
        });
    }

    /**
     * Revoke a pending invitation. Terminal states are refused
     * with stable codes; revocation of an expired-but-pending row
     * is allowed and wins over expiry. Authority: the invitation's
     * own scope authority (for combined, EITHER scope authority
     * suffices — revocation only ever removes a pending grant).
     * Revocation never touches memberships.
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

            $this->assertRevocationAuthority($actor, $locked);

            $locked->forceFill([
                'status' => CoreInvitation::STATUS_REVOKED,
                'revoked_at' => CarbonImmutable::now('UTC'),
                'revoked_by_user_id' => $actor->id,
                'status_version' => (int) $locked->status_version + 1,
            ])->save();

            $this->audit->record($actor, 'invitation.revoked', [
                'invitation_id' => (int) $locked->id,
                'type' => $locked->type,
                'intended_organization_role_id' => $locked->intended_organization_role_id !== null ? (int) $locked->intended_organization_role_id : null,
                'intended_workspace_role_id' => $locked->intended_workspace_role_id !== null ? (int) $locked->intended_workspace_role_id : null,
            ], $locked->workspace_id !== null ? 'workspace' : 'organization',
                $locked->workspace_id !== null ? (int) $locked->workspace_id : (int) $locked->organization_id,
                'invitation', (int) $locked->id);

            return $locked;
        });
    }

    /**
     * Read-only lookup by raw token (presentation + C6-2
     * acceptance start here). A lookup NEVER consumes or mutates
     * the invitation.
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
        ?ScopedRole $organizationRole,
        ?ScopedRole $workspaceRole,
        ?string $message,
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
            'intended_organization_role_id' => $organizationRole?->id,
            'intended_workspace_role_id' => $workspaceRole?->id,
            'invited_by_user_id' => $actor->id,
            'message' => $message,
            'expires_at' => $expiresAt,
            'status_version' => 1,
        ]);

        $this->audit->record($actor, 'invitation.issued', [
            'invitation_id' => (int) $invitation->id,
            'type' => $type,
            'intended_organization_role_id' => $organizationRole !== null ? (int) $organizationRole->id : null,
            'intended_workspace_role_id' => $workspaceRole !== null ? (int) $workspaceRole->id : null,
            'expires_at' => $expiresAt->toIso8601String(),
        ], $workspace !== null ? 'workspace' : 'organization',
            $workspace !== null ? (int) $workspace->id : (int) $organization->id,
            'invitation', (int) $invitation->id);

        return new IssuedInvitation($invitation, $rawToken);
    }

    /**
     * @throws InvitationException
     */
    private function assertRevocationAuthority(User $actor, CoreInvitation $invitation): void
    {
        if ($invitation->workspace_id !== null) {
            $workspace = Workspace::query()->whereKey($invitation->workspace_id)->lockForUpdate()->firstOrFail();
            $organization = $workspace->organization_id !== null
                ? Organization::query()->whereKey($workspace->organization_id)->first()
                : null;
        } else {
            $workspace = null;
            $organization = Organization::query()->whereKey($invitation->organization_id)->lockForUpdate()->firstOrFail();
        }

        if ($organization !== null) {
            $this->assertOrganizationOperational($organization);
        }

        $operational = AccountStatus::of($actor->status)?->allowsOperationalAccess() ?? false;

        if (! $operational) {
            throw new InvitationException('invitation_forbidden', 'The actor lacks invitation authority in this scope.');
        }

        $workspaceAuthority = $workspace !== null
            && in_array(self::WORKSPACE_INVITE_PERMISSION, $this->permissions->workspacePermissionKeys($actor, $workspace), true);
        $organizationAuthority = $organization !== null
            && in_array(self::ORGANIZATION_INVITE_PERMISSION, $this->permissions->organizationPermissionKeys($actor, $organization), true);

        $allowed = match ($invitation->type) {
            CoreInvitation::TYPE_ORGANIZATION => $organizationAuthority,
            CoreInvitation::TYPE_WORKSPACE => $workspaceAuthority,
            CoreInvitation::TYPE_COMBINED => $workspaceAuthority || $organizationAuthority,
            default => false,
        };

        if (! $allowed) {
            throw new InvitationException('invitation_forbidden', 'The actor lacks invitation authority in this scope.');
        }
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
     * Optional message: trimmed, plain text (markup stripped),
     * at most 1000 characters. The message is invitee-facing
     * content, not a credential channel — it is stored once,
     * immutable, and only ever rendered escaped (C6-4).
     *
     * @throws InvitationException
     */
    private function normalizeMessage(?string $message): ?string
    {
        if ($message === null) {
            return null;
        }

        $clean = trim(strip_tags($message));

        if ($clean === '') {
            return null;
        }

        if (mb_strlen($clean) > CoreInvitation::MESSAGE_MAX_LENGTH) {
            throw new InvitationException('invitation_message_too_long', 'The invitation message may not exceed '.CoreInvitation::MESSAGE_MAX_LENGTH.' characters.');
        }

        return $clean;
    }

    /**
     * @throws InvitationException
     */
    private function assertNoEffectiveDuplicate(string $type, ?int $organizationId, ?int $workspaceId, string $normalizedEmail, ?int $organizationRoleId, ?int $workspaceRoleId): void
    {
        $query = CoreInvitation::query()
            ->where('type', $type)
            ->where('email_normalized', $normalizedEmail)
            ->where('status', CoreInvitation::STATUS_PENDING);

        if ($organizationId !== null) {
            $query->where('organization_id', $organizationId);
        }

        if ($workspaceId !== null) {
            $query->where('workspace_id', $workspaceId);
        }

        if ($organizationRoleId !== null) {
            $query->where('intended_organization_role_id', $organizationRoleId);
        }

        if ($workspaceRoleId !== null) {
            $query->where('intended_workspace_role_id', $workspaceRoleId);
        }

        $now = CarbonImmutable::now('UTC');

        foreach ($query->get() as $existing) {
            if ($existing->isAcceptanceEligible($now)) {
                throw new InvitationException('invitation_duplicate_pending', 'A pending invitation already exists for this email, scope, and role.');
            }
        }
    }
}
