<?php

namespace App\Core\Rbac;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;

/**
 * Effective scoped permissions (Stage 03B). This is the single resolver
 * domain code asks "what may this user do in this scope container" —
 * no endpoint re-implements these rules.
 *
 * An inactive (deactivated/ended) membership exercises nothing. For an
 * organizational workspace an active organization membership is an
 * additional prerequisite (ADR-0003); organization permissions alone
 * therefore never yield workspace permissions.
 */
final class MembershipPermissions
{
    /** @return list<string> */
    public function workspacePermissionKeys(User $user, Workspace $workspace): array
    {
        if (! $workspace->isActive()) {
            return [];
        }

        $membership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->first();

        if ($membership === null) {
            return [];
        }

        if ($workspace->isOrganizational() && ! $this->hasActiveOrganizationMembership($user, (int) $workspace->organization_id)) {
            return [];
        }

        return $this->keysOfRole($membership->role, PermissionCatalog::SCOPE_WORKSPACE, $workspace->id, 'workspace_id');
    }

    /** @return list<string> */
    public function organizationPermissionKeys(User $user, Organization $organization): array
    {
        $membership = OrganizationMembership::where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->first();

        if ($membership === null) {
            return [];
        }

        return $this->keysOfRole($membership->role, PermissionCatalog::SCOPE_ORGANIZATION, $organization->id, 'organization_id');
    }

    /**
     * @throws RbacValidationException on unknown keys or scope mismatch
     */
    public function userHasWorkspacePermission(User $user, Workspace $workspace, string $permissionKey): bool
    {
        PermissionCatalog::assertKnownKeysForScope([$permissionKey], PermissionCatalog::SCOPE_WORKSPACE);

        return in_array($permissionKey, $this->workspacePermissionKeys($user, $workspace), true);
    }

    /**
     * @throws RbacValidationException on unknown keys or scope mismatch
     */
    public function userHasOrganizationPermission(User $user, Organization $organization, string $permissionKey): bool
    {
        PermissionCatalog::assertKnownKeysForScope([$permissionKey], PermissionCatalog::SCOPE_ORGANIZATION);

        return in_array($permissionKey, $this->organizationPermissionKeys($user, $organization), true);
    }

    private function hasActiveOrganizationMembership(User $user, int $organizationId): bool
    {
        return OrganizationMembership::where('organization_id', $organizationId)
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->exists();
    }

    /**
     * Defensive scope/container check: a role that does not belong to
     * this exact scope container grants nothing, even if a stray
     * role_id was written outside the assignment services.
     *
     * @return list<string>
     */
    private function keysOfRole(?ScopedRole $role, string $scope, int $containerId, string $containerColumn): array
    {
        if ($role === null || $role->scope !== $scope || (int) $role->{$containerColumn} !== $containerId) {
            return [];
        }

        return $role->permissionKeys();
    }
}
