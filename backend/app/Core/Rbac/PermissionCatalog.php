<?php

namespace App\Core\Rbac;

/**
 * The single canonical catalog of scoped permission keys (Stage 03B,
 * ADR-0004). Core owns the foundation keys below; business modules will
 * register their own scoped keys here in their Stage 05 slices — keys
 * are never re-typed as literals elsewhere and never hand-mirrored.
 *
 * The `core_permissions` table is a database mirror of this catalog
 * (materialized by {@see sync()}), not a second writable catalog: role
 * permission grants reference catalog keys, unknown keys are rejected.
 *
 * Scope separation is strict:
 *  - organization keys govern the organization management plane only and
 *    never grant operational workspace data access (ADR-0003);
 *  - workspace keys govern one workspace's operational plane;
 *  - platform keys (Stage C2-1, OD-1) govern the platform
 *    administration plane only and likewise never grant workspace
 *    operational access.
 */
final class PermissionCatalog
{
    public const SCOPE_ORGANIZATION = 'organization';

    public const SCOPE_WORKSPACE = 'workspace';

    public const SCOPE_PLATFORM = 'platform';

    /**
     * @var array<string, array{scope: string, name: string}>
     */
    private const PERMISSIONS = [
        // Organization management plane.
        'organization.view' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'View organization'],
        'organization.manage' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'Manage organization settings'],
        'organization.members.view' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'View organization members'],
        'organization.members.manage' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'Manage organization memberships'],
        'organization.roles.view' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'View organization roles'],
        'organization.roles.manage' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'Manage organization roles and assignments'],
        'organization.workspaces.create' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'Create organization workspaces'],
        'organization.workspaces.assign_managers' => ['scope' => self::SCOPE_ORGANIZATION, 'name' => 'Assign workspace managers'],

        // Workspace operational plane.
        'workspace.view' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'View workspace'],
        'workspace.manage' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Manage workspace settings'],
        'workspace.members.view' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'View workspace members'],
        'workspace.members.manage' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Manage workspace memberships'],
        'workspace.roles.view' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'View workspace roles'],
        'workspace.roles.manage' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Manage workspace roles and assignments'],

        // Platform administration plane (Stage C2-1, OD-1). The
        // organization lifecycle keys arrive with the reviewed
        // Stage C3-2 expansion; registering a key here grants it
        // to nobody — protected-role expansion happens only in
        // PlatformRoleProvisioner's explicit approved set.
        'platform.admins.view' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'View platform administrators'],
        'platform.admins.manage' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'Manage platform administrators'],
        'platform.users.view' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'View platform users'],
        'platform.users.manage_status' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'Manage platform user account status'],
        'platform.organizations.view' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'View platform organizations'],
        'platform.organizations.manage_status' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'Suspend and reactivate organizations'],
        'platform.organizations.end' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'End organizations'],
        'platform.organizations.restore' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'Restore ended organizations'],
        'platform.audit.view' => ['scope' => self::SCOPE_PLATFORM, 'name' => 'View platform audit log'],

        // Projects module (Stage 04B pilot; keys owned by the Projects
        // module, registered here per the catalog-ownership contract —
        // same stable keys as the legacy global catalog, now with
        // workspace-scoped meaning).
        'projects.view' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'View projects'],
        'projects.create' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Create projects'],
        'projects.edit' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Edit projects'],
        'projects.delete' => ['scope' => self::SCOPE_WORKSPACE, 'name' => 'Archive and delete projects'],
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::PERMISSIONS);
    }

    /** @return list<string> */
    public static function keysForScope(string $scope): array
    {
        return array_keys(array_filter(
            self::PERMISSIONS,
            fn (array $definition): bool => $definition['scope'] === $scope,
        ));
    }

    public static function exists(string $key): bool
    {
        return isset(self::PERMISSIONS[$key]);
    }

    public static function scopeOf(string $key): ?string
    {
        return self::PERMISSIONS[$key]['scope'] ?? null;
    }

    /**
     * @param  list<string>  $keys
     *
     * @throws RbacValidationException on any unknown key or scope mismatch
     */
    public static function assertKnownKeysForScope(array $keys, string $scope): void
    {
        foreach ($keys as $key) {
            if (! self::exists($key)) {
                throw new RbacValidationException("Unknown permission key [{$key}].");
            }

            if (self::scopeOf($key) !== $scope) {
                throw new RbacValidationException("Permission key [{$key}] does not belong to the [{$scope}] scope.");
            }
        }
    }

    /**
     * Materialize the catalog into core_permissions (idempotent).
     * Returns the number of rows present after syncing.
     */
    public static function sync(): int
    {
        foreach (self::PERMISSIONS as $key => $definition) {
            ScopedPermission::updateOrCreate(
                ['key' => $key],
                ['scope' => $definition['scope'], 'name' => $definition['name']],
            );
        }

        return ScopedPermission::count();
    }
}
