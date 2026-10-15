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

        $workspaceMembership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->first();

        if ($workspaceMembership === null) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::MEMBERSHIP_MISSING,
                'The user is not a member of this workspace.',
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

            $organizationMembership = OrganizationMembership::where('organization_id', $workspace->organization_id)
                ->where('user_id', $user->id)
                ->first();

            if ($organizationMembership === null) {
                throw new AuthorizationDeniedException(
                    AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_MISSING,
                    'The user is not a member of the owning organization.',
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
