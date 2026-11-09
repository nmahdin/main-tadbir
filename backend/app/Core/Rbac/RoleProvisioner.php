<?php

namespace App\Core\Rbac;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use Illuminate\Database\QueryException;

/**
 * Ensures the protected default roles of one organization or workspace
 * (Stage 03B, ADR-0004). Idempotent and duplicate-safe.
 *
 * Protected role permission sets are defined here (and only here):
 *  - Workspace Manager:   every workspace-scope catalog key except
 *                         the separately-provisioned secrets keys
 *                         (C7-3; see PermissionCatalog);
 *  - Member:              workspace.view;
 *  - Organization Manager: every organization-scope catalog key
 *                         except the separately-provisioned keys;
 *  - Organization Member:  organization.view.
 * "Every catalog key" means the protected manager roles always cover
 * the full foundation catalog of their scope, so a manager's grant
 * ceiling equals the whole scope and they can administer custom roles
 * without ever exceeding their own authority.
 */
final class RoleProvisioner
{
    public const WORKSPACE_MANAGER_KEY = 'workspace_manager';

    public const WORKSPACE_MEMBER_KEY = 'member';

    public const ORGANIZATION_MANAGER_KEY = 'organization_manager';

    public const ORGANIZATION_MEMBER_KEY = 'organization_member';

    /**
     * @return array{manager: ScopedRole, member: ScopedRole}
     */
    public function ensureForWorkspace(Workspace $workspace): array
    {
        PermissionCatalog::sync();

        $manager = $this->ensureRole(
            scope: PermissionCatalog::SCOPE_WORKSPACE,
            container: ['workspace_id' => $workspace->id],
            key: self::WORKSPACE_MANAGER_KEY,
            name: 'Workspace Manager',
            permissionKeys: PermissionCatalog::managerKeysForScope(PermissionCatalog::SCOPE_WORKSPACE),
        );

        $member = $this->ensureRole(
            scope: PermissionCatalog::SCOPE_WORKSPACE,
            container: ['workspace_id' => $workspace->id],
            key: self::WORKSPACE_MEMBER_KEY,
            name: 'Member',
            permissionKeys: ['workspace.view'],
        );

        return ['manager' => $manager, 'member' => $member];
    }

    /**
     * @return array{manager: ScopedRole, member: ScopedRole}
     */
    public function ensureForOrganization(Organization $organization): array
    {
        PermissionCatalog::sync();

        $manager = $this->ensureRole(
            scope: PermissionCatalog::SCOPE_ORGANIZATION,
            container: ['organization_id' => $organization->id],
            key: self::ORGANIZATION_MANAGER_KEY,
            name: 'Organization Manager',
            permissionKeys: PermissionCatalog::managerKeysForScope(PermissionCatalog::SCOPE_ORGANIZATION),
        );

        $member = $this->ensureRole(
            scope: PermissionCatalog::SCOPE_ORGANIZATION,
            container: ['organization_id' => $organization->id],
            key: self::ORGANIZATION_MEMBER_KEY,
            name: 'Organization Member',
            permissionKeys: ['organization.view'],
        );

        return ['manager' => $manager, 'member' => $member];
    }

    public function workspaceManager(Workspace $workspace): ScopedRole
    {
        return $this->ensureForWorkspace($workspace)['manager'];
    }

    public function workspaceMember(Workspace $workspace): ScopedRole
    {
        return $this->ensureForWorkspace($workspace)['member'];
    }

    public function organizationManager(Organization $organization): ScopedRole
    {
        return $this->ensureForOrganization($organization)['manager'];
    }

    public function organizationMember(Organization $organization): ScopedRole
    {
        return $this->ensureForOrganization($organization)['member'];
    }

    /**
     * @param  array<string, int>  $container
     * @param  list<string>  $permissionKeys
     */
    private function ensureRole(string $scope, array $container, string $key, string $name, array $permissionKeys): ScopedRole
    {
        $attributes = array_merge(['scope' => $scope, 'key' => $key], $container);

        try {
            $role = ScopedRole::firstOrCreate($attributes, ['name' => $name, 'is_protected' => true]);
        } catch (QueryException) {
            // Concurrent creator won the unique (scope, owner, key) race.
            $role = ScopedRole::where($attributes)->firstOrFail();
        }

        $permissionIds = ScopedPermission::whereIn('key', $permissionKeys)->pluck('id');
        $role->permissions()->sync($permissionIds);

        return $role->refresh();
    }
}
