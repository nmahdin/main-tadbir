<?php

namespace App\Core\Authorization;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;

/**
 * Trusted server-side workspace context resolution (Stage 04A,
 * core.md §2.1 steps 1–4). A client-supplied workspace identifier is
 * only ever a lookup key: resolution succeeds solely when the user is
 * platform-active, the workspace is active, an ACTIVE workspace
 * membership exists, and — for organizational workspaces — an ACTIVE
 * organization membership also exists. Deny-by-default; every failure
 * is a typed AuthorizationException with a stable reason code.
 *
 * Platform administrators receive no implicit context: there is no
 * bypass here (identity alone grants no workspace access, ADR-0003).
 */
final class WorkspaceContextResolver
{
    public function resolve(User $user, int|string|null $workspaceId): WorkspaceContext
    {
        // Re-read persisted state (same semantics as the EnsureActiveAccount
        // middleware): a mid-session suspension, and attributes the
        // database defaulted at insert time, must both be honored.
        if ($user->exists) {
            $user->refresh();
        }

        if (! $user->isActive()) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::ACCOUNT_INACTIVE,
                'The user account is not active.',
            );
        }

        $workspace = $this->findWorkspace($workspaceId);

        if (! $workspace->isActive()) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::WORKSPACE_INACTIVE,
                'The workspace is not active.',
            );
        }

        // Current membership = the single non-ended record for this
        // user and scope (Stage 03A live-uniqueness invariant). Ended
        // records are history: they must never shadow a rejoined
        // membership, and their (cleared) roles never come back.
        $workspaceMembership = $this->currentMembership(
            WorkspaceMembership::class, 'workspace_id', (int) $workspace->id, (int) $user->id,
        );

        if ($workspaceMembership === null) {
            $hasEndedHistory = $this->hasEndedMembership(
                WorkspaceMembership::class, 'workspace_id', (int) $workspace->id, (int) $user->id,
            );

            throw new AuthorizationDeniedException(
                $hasEndedHistory
                    ? AuthorizationDeniedException::MEMBERSHIP_INACTIVE
                    : AuthorizationDeniedException::MEMBERSHIP_MISSING,
                $hasEndedHistory
                    ? 'The workspace membership has ended.'
                    : 'The user is not a member of this workspace.',
            );
        }

        if ($workspaceMembership->status !== MembershipStatus::Active) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
                'The workspace membership is not active.',
            );
        }

        $organizationMembership = null;
        $organization = null;

        if ($workspace->isOrganizational()) {
            $organization = $workspace->organization;

            $organizationMembership = $this->currentMembership(
                OrganizationMembership::class, 'organization_id', (int) $workspace->organization_id, (int) $user->id,
            );

            if ($organizationMembership === null) {
                $hasEndedHistory = $this->hasEndedMembership(
                    OrganizationMembership::class, 'organization_id', (int) $workspace->organization_id, (int) $user->id,
                );

                throw new AuthorizationDeniedException(
                    $hasEndedHistory
                        ? AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_INACTIVE
                        : AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_MISSING,
                    $hasEndedHistory
                        ? 'The organization membership has ended.'
                        : 'The user is not a member of the owning organization.',
                );
            }

            if ($organizationMembership->status !== MembershipStatus::Active) {
                throw new AuthorizationDeniedException(
                    AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_INACTIVE,
                    'The organization membership is not active.',
                );
            }
        }

        $role = $workspaceMembership->role;
        $permissionKeys = [];
        if ($role !== null
            && $role->isWorkspaceScoped()
            && (int) $role->workspace_id === (int) $workspace->id) {
            $permissionKeys = $role->permissionKeys();
        }

        return new WorkspaceContext(
            user: $user,
            workspace: $workspace,
            workspaceMembership: $workspaceMembership,
            organizationMembership: $organizationMembership,
            organization: $organization,
            role: $role,
            permissionKeys: $permissionKeys,
        );
    }

    public function resolveFromWorkspace(User $user, Workspace $workspace): WorkspaceContext
    {
        return $this->resolve($user, (int) $workspace->id);
    }

    /**
     * The current (non-ended) membership of a user in one scope
     * container, or null when only ended history — or nothing — exists.
     * The Stage 03A generated live-key unique index guarantees at most
     * one non-ended record per (container, user); the newest-first
     * order is a defensive tiebreak, never a second source of truth.
     *
     * @param  class-string<WorkspaceMembership|OrganizationMembership>  $modelClass
     */
    private function currentMembership(string $modelClass, string $containerColumn, int $containerId, int $userId): WorkspaceMembership|OrganizationMembership|null
    {
        return $modelClass::query()
            ->where($containerColumn, $containerId)
            ->where('user_id', $userId)
            ->where('status', '!=', MembershipStatus::Ended->value)
            ->orderByDesc('id')
            ->first();
    }

    /**
     * @param  class-string<WorkspaceMembership|OrganizationMembership>  $modelClass
     */
    private function hasEndedMembership(string $modelClass, string $containerColumn, int $containerId, int $userId): bool
    {
        return $modelClass::query()
            ->where($containerColumn, $containerId)
            ->where('user_id', $userId)
            ->where('status', MembershipStatus::Ended->value)
            ->exists();
    }

    private function findWorkspace(int|string|null $workspaceId): Workspace
    {
        $id = match (true) {
            is_int($workspaceId) => $workspaceId,
            is_string($workspaceId) && ctype_digit($workspaceId) => (int) $workspaceId,
            default => null,
        };

        $workspace = $id !== null && $id > 0 ? Workspace::find($id) : null;

        if ($workspace === null) {
            throw new InvalidAuthorizationContextException(
                'workspace_not_found',
                'The workspace does not exist.',
            );
        }

        return $workspace;
    }
}
