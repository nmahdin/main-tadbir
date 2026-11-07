<?php

namespace App\Core\Invitations;

use App\Core\Audit\AuditWriter;
use App\Core\Identity\AccountStatus;
use App\Core\Identity\EmailVerificationService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Rbac\GrantCeiling;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedRole;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Subscriptions\ResourceLimitGuard;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Atomic invitation acceptance (Stage C6-2).
 *
 * One transaction, documented lock order: invitation row ->
 * organization row -> workspace row -> membership rows (scope
 * containers before memberships, consistent with the C3 role
 * services). Any failure rolls back membership creation, role
 * assignment, audit, and invitation consumption together — the
 * token is consumed ONLY by a fully successful acceptance.
 * Views, lookups, logins, and incomplete registrations never
 * reach this service and never consume anything.
 *
 * Rules enforced inside the transaction:
 *  - the accepter is an operationally active account whose
 *    VERIFIED normalized email equals the invitation destination
 *    (invitation_email_mismatch; an invitation can never be
 *    transferred to another account);
 *  - token state: pending and unexpired at the exact boundary
 *    (already accepted/revoked/expired fail closed);
 *  - scope ownership revalidated from persisted rows (combined:
 *    stored organization must still own the workspace);
 *  - the owning organization must be operational for every
 *    organizational scope (suspension/termination always denies);
 *  - inviter authority revalidated against CURRENT persisted
 *    assignments: the inviter must still hold the invitation
 *    permission for each involved scope and each intended role
 *    must still fit the inviter's current effective permissions
 *    (independent Grant Ceilings);
 *  - membership creation is additive only: missing memberships
 *    are created with the intended roles via the same
 *    system-assignment path provisioners use; an existing ACTIVE
 *    organization membership keeps its current role untouched
 *    (never replaced or elevated — combined included); an
 *    existing active workspace membership with a DIFFERENT role
 *    is a stable conflict (invitation_membership_conflict),
 *    never a silent escalation; a DEACTIVATED live membership is
 *    likewise a conflict (reactivation belongs to the membership
 *    services); an ENDED membership is recreated fresh (the live
 *    uniqueness convention);
 *  - workspace-only invitations require an already-active
 *    organization membership in the owning organization
 *    (invitation_prerequisite_missing) and never create one;
 *  - organization invitations never create workspace membership;
 *  - repeated acceptance can never duplicate a membership
 *    (the DB live-uniqueness indexes are the final safeguard).
 */
final class InvitationAcceptanceService
{
    public function __construct(
        private readonly EmailVerificationService $emailVerification,
        private readonly MembershipPermissions $permissions,
        private readonly OrganizationRoleService $organizationRoles,
        private readonly WorkspaceRoleService $workspaceRoles,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * @throws InvitationException
     */
    public function accept(User $accepter, string $rawToken): InvitationAcceptanceResult
    {
        $invitation = app(InvitationService::class)->resolveByRawToken($rawToken);

        if ($invitation === null) {
            throw new InvitationException('invitation_not_found', 'The invitation could not be found.');
        }

        return DB::transaction(function () use ($accepter, $invitation): InvitationAcceptanceResult {
            $locked = CoreInvitation::query()->whereKey($invitation->id)->lockForUpdate()->firstOrFail();
            $now = CarbonImmutable::now('UTC');

            match ($locked->effectiveState($now)) {
                InvitationState::PendingAcceptance => null,
                InvitationState::Accepted => throw new InvitationException('invitation_already_accepted', 'The invitation has already been accepted.'),
                InvitationState::Revoked => throw new InvitationException('invitation_revoked', 'The invitation has been revoked.'),
                InvitationState::Expired => throw new InvitationException('invitation_expired', 'The invitation has expired.'),
            };

            if (! (AccountStatus::of($accepter->status)?->allowsOperationalAccess() ?? false)) {
                throw new InvitationException('invitation_forbidden', 'The account is not eligible to accept invitations.');
            }

            if ($this->emailVerification->verifiedEmail($accepter) !== $locked->email_normalized) {
                throw new InvitationException('invitation_email_mismatch', 'The account does not hold a verified email matching this invitation.');
            }

            $organization = $locked->organization_id !== null
                ? Organization::query()->whereKey($locked->organization_id)->lockForUpdate()->firstOrFail()
                : null;
            $workspace = $locked->workspace_id !== null
                ? Workspace::query()->whereKey($locked->workspace_id)->lockForUpdate()->firstOrFail()
                : null;

            if ($workspace !== null && $workspace->organization_id !== null) {
                // Owning organization always derives from the
                // persisted workspace, never from invitation input.
                $owningOrganization = $organization !== null && (int) $organization->id === (int) $workspace->organization_id
                    ? $organization
                    : Organization::query()->whereKey($workspace->organization_id)->lockForUpdate()->firstOrFail();

                if ($locked->type === CoreInvitation::TYPE_COMBINED && (int) $locked->organization_id !== (int) $workspace->organization_id) {
                    throw new InvitationException('invitation_scope_invalid', 'The invitation organization no longer owns the workspace.');
                }

                $organization ??= $owningOrganization;
            }

            if ($organization !== null && ! $organization->isActive()) {
                throw new InvitationException('invitation_organization_unavailable', 'The organization is not operational, so the invitation cannot be accepted.');
            }

            $this->revalidateInviter($locked, $organization, $workspace);

            [$createdOrganization, $preservedOrganization] = $this->ensureOrganizationMembership($locked, $accepter, $organization);
            [$createdWorkspace, $preservedWorkspace] = $this->ensureWorkspaceMembership($locked, $accepter, $organization, $workspace, $createdOrganization, $preservedOrganization);

            $locked->forceFill([
                'status' => CoreInvitation::STATUS_ACCEPTED,
                'accepted_at' => $now,
                'accepted_by_user_id' => $accepter->id,
                'status_version' => (int) $locked->status_version + 1,
            ])->save();

            $this->audit->record($accepter, 'invitation.accepted', [
                'invitation_id' => (int) $locked->id,
                'type' => $locked->type,
                'created_organization_membership' => $createdOrganization,
                'created_workspace_membership' => $createdWorkspace,
                'preserved_organization_role' => $preservedOrganization,
                'preserved_workspace_role' => $preservedWorkspace,
            ], $workspace !== null ? 'workspace' : 'organization',
                $workspace !== null ? (int) $workspace->id : (int) $organization->id,
                'invitation', (int) $locked->id);

            return new InvitationAcceptanceResult(
                (int) $locked->id,
                $locked->type,
                $organization !== null ? (int) $organization->id : null,
                $workspace !== null ? (int) $workspace->id : null,
                $createdOrganization,
                $createdWorkspace,
                $preservedOrganization,
                $preservedWorkspace,
            );
        });
    }

    /**
     * Inviter authority + ceilings against CURRENT persisted
     * state (acceptance-time revalidation; fails closed).
     *
     * @throws InvitationException
     */
    private function revalidateInviter(CoreInvitation $invitation, ?Organization $organization, ?Workspace $workspace): void
    {
        $inviter = User::query()->find($invitation->invited_by_user_id);

        if ($inviter === null || ! (AccountStatus::of($inviter->status)?->allowsOperationalAccess() ?? false)) {
            throw new InvitationException('invitation_inviter_authority_lost', 'The inviter no longer holds valid authority for this invitation.');
        }

        if ($invitation->intended_organization_role_id !== null) {
            $keys = $organization !== null ? $this->permissions->organizationPermissionKeys($inviter, $organization) : [];

            if (! in_array(InvitationService::ORGANIZATION_INVITE_PERMISSION, $keys, true)) {
                throw new InvitationException('invitation_inviter_authority_lost', 'The inviter no longer holds organization invitation authority.');
            }

            $this->assertCeilingAgainst($keys, (int) $invitation->intended_organization_role_id, 'organization');
        }

        if ($invitation->intended_workspace_role_id !== null) {
            $keys = $workspace !== null ? $this->permissions->workspacePermissionKeys($inviter, $workspace) : [];

            if (! in_array(InvitationService::WORKSPACE_INVITE_PERMISSION, $keys, true)) {
                throw new InvitationException('invitation_inviter_authority_lost', 'The inviter no longer holds workspace invitation authority.');
            }

            $this->assertCeilingAgainst($keys, (int) $invitation->intended_workspace_role_id, 'workspace');
        }
    }

    /**
     * @param  list<string>  $inviterKeys
     *
     * @throws InvitationException
     */
    private function assertCeilingAgainst(array $inviterKeys, int $roleId, string $scopeLabel): void
    {
        $role = ScopedRole::query()->find($roleId);

        if ($role === null) {
            throw new InvitationException('invitation_inviter_authority_lost', 'The intended role no longer exists.');
        }

        try {
            GrantCeiling::assertWithinCeiling($inviterKeys, $role->permissionKeys(), $scopeLabel);
        } catch (RbacValidationException $exception) {
            throw new InvitationException('invitation_grant_ceiling', $exception->getMessage());
        }
    }

    /**
     * @return array{0: bool, 1: bool} [created, preservedExistingRole]
     *
     * @throws InvitationException
     */
    private function ensureOrganizationMembership(CoreInvitation $invitation, User $accepter, ?Organization $organization): array
    {
        if (! $invitation->willCreateOrganizationMembership() || $organization === null) {
            return [false, false];
        }

        $existing = OrganizationMembership::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $accepter->id)
            ->lockForUpdate()
            ->first();

        if ($existing !== null && $existing->status === MembershipStatus::Active) {
            // Preserve the existing organization role exactly —
            // never replace or elevate it (combined included).
            return [false, true];
        }

        if ($existing !== null && $existing->status === MembershipStatus::Deactivated) {
            throw new InvitationException('invitation_membership_conflict', 'A deactivated organization membership already exists; reactivation is handled outside invitations.');
        }

        // C5-EXT-01 M1: creating a NEW organization membership counts
        // against the organization's published member cap. Preserved
        // memberships above never reach this point, and no existing
        // data is removed when the cap is reached.
        try {
            app(ResourceLimitGuard::class)->assertCanCreateForOrganization($organization, 'organization_members');
        } catch (ValidationException $exception) {
            throw new InvitationException('plan_limit_exceeded', $exception->validator->errors()->first() ?? 'سقف اعضای سازمان در اشتراک فعلی تکمیل شده است.');
        }

        // No membership, or only an ended one (live-key falls out):
        // create exactly one with the intended role.
        $membership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $accepter->id,
            'status' => MembershipStatus::Active,
        ]);
        $this->organizationRoles->assignSystemRole($membership, ScopedRole::query()->findOrFail($invitation->intended_organization_role_id));

        return [true, false];
    }

    /**
     * @return array{0: bool, 1: bool} [created, preservedExistingRole]
     *
     * @throws InvitationException
     */
    private function ensureWorkspaceMembership(
        CoreInvitation $invitation,
        User $accepter,
        ?Organization $organization,
        ?Workspace $workspace,
        bool $createdOrganizationMembership,
        bool $preservedOrganizationRole,
    ): array {
        if ($invitation->type === CoreInvitation::TYPE_ORGANIZATION || $workspace === null) {
            return [false, false];
        }

        // Workspace-only invitations never create organization
        // membership: their prerequisite must already hold.
        if ($invitation->type === CoreInvitation::TYPE_WORKSPACE
            && $workspace->organization_id !== null
            && ! $createdOrganizationMembership
            && ! $this->hasActiveOrganizationMembership($accepter, (int) $workspace->organization_id)) {
            throw new InvitationException('invitation_prerequisite_missing', 'Organization membership is required before accepting this workspace invitation.');
        }

        $existing = WorkspaceMembership::query()
            ->where('workspace_id', $workspace->id)
            ->where('user_id', $accepter->id)
            ->lockForUpdate()
            ->first();

        if ($existing !== null && $existing->status === MembershipStatus::Active) {
            if ((int) $existing->role_id === (int) $invitation->intended_workspace_role_id) {
                return [false, true];
            }

            throw new InvitationException('invitation_membership_conflict', 'An active workspace membership with a different role already exists; invitations never silently change it.');
        }

        if ($existing !== null && $existing->status === MembershipStatus::Deactivated) {
            throw new InvitationException('invitation_membership_conflict', 'A deactivated workspace membership already exists; reactivation is handled outside invitations.');
        }

        // C5-EXT-01 M1: workspace member cap for NEW memberships.
        try {
            app(ResourceLimitGuard::class)->assertCanCreate($workspace, 'workspace_members');
        } catch (ValidationException $exception) {
            throw new InvitationException('plan_limit_exceeded', $exception->validator->errors()->first() ?? 'سقف اعضای فضای کاری در اشتراک فعلی تکمیل شده است.');
        }

        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $accepter->id,
            'status' => MembershipStatus::Active,
        ]);
        $this->workspaceRoles->assignSystemRole($membership, ScopedRole::query()->findOrFail($invitation->intended_workspace_role_id));

        return [true, false];
    }

    private function hasActiveOrganizationMembership(User $user, int $organizationId): bool
    {
        return OrganizationMembership::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->exists();
    }
}
