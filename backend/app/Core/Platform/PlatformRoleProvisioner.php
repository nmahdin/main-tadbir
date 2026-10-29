<?php

namespace App\Core\Platform;

use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use Illuminate\Database\QueryException;

/**
 * Idempotent provisioning of the protected `primary_administrator`
 * platform role (Stage C2-1).
 *
 * The approved permission set below is exhaustive and changes
 * only through explicit, reviewed stage changes. Unlike
 * RoleProvisioner for scoped roles (which re-aligns protected
 * roles on every run), repeat provisioning here VERIFIES the
 * existing definition and fails loudly on any difference:
 * privileges are never silently expanded or changed by catalog
 * synchronization, and future catalog keys reach this role only
 * through a reviewed change to this list.
 *
 * Stage C3-2 reviewed expansion: the three organization
 * lifecycle keys were added to the approved set. An existing
 * role holding exactly the previous C2 set is upgraded (the new
 * keys attached) by this explicit provisioning run — and only
 * then; any other difference (extra keys, missing C2 keys)
 * remains a loud conflict.
 *
 * Stage C5-2 reviewed expansion: `platform.subscriptions.manage`
 * is added the same way — a role holding exactly the frozen C2 or
 * C3-2 set is upgraded by this provisioning run; catalog
 * synchronization alone never expands the role.
 *
 * Provisioning creates/upgrades the role definition only — it
 * never assigns the role to any user, so no legacy administrator
 * is ever automatically promoted.
 */
final class PlatformRoleProvisioner
{
    public const PRIMARY_ROLE_KEY = 'primary_administrator';

    /** @var list<string> Previous approved set (Stage C2, frozen). */
    private const PRIMARY_PERMISSIONS_C2 = [
        'platform.admins.view',
        'platform.admins.manage',
        'platform.users.view',
        'platform.users.manage_status',
        'platform.organizations.view',
        'platform.audit.view',
    ];

    /** @var list<string> Approved set after the Stage C3-2 expansion (frozen). */
    private const PRIMARY_PERMISSIONS_C3_2 = [
        'platform.admins.view',
        'platform.admins.manage',
        'platform.users.view',
        'platform.users.manage_status',
        'platform.organizations.view',
        'platform.organizations.manage_status',
        'platform.organizations.end',
        'platform.organizations.restore',
        'platform.audit.view',
    ];

    /** @var list<string> Approved set after the Stage C5-2 expansion. */
    private const PRIMARY_PERMISSIONS = [
        'platform.admins.view',
        'platform.admins.manage',
        'platform.users.view',
        'platform.users.manage_status',
        'platform.organizations.view',
        'platform.organizations.manage_status',
        'platform.organizations.end',
        'platform.organizations.restore',
        'platform.audit.view',
        'platform.subscriptions.manage',
    ];

    /** @return list<string> */
    public static function primaryPermissions(): array
    {
        return self::PRIMARY_PERMISSIONS;
    }

    public function ensurePrimaryAdministrator(): PlatformRole
    {
        PermissionCatalog::assertKnownKeysForScope(self::PRIMARY_PERMISSIONS, PermissionCatalog::SCOPE_PLATFORM);

        try {
            $role = PlatformRole::firstOrCreate(
                ['key' => self::PRIMARY_ROLE_KEY],
                ['name' => 'Primary Administrator', 'is_protected' => true],
            );
        } catch (QueryException) {
            // Concurrent creator won the unique key race.
            $role = PlatformRole::where('key', self::PRIMARY_ROLE_KEY)->firstOrFail();
        }

        if (! $role->is_protected) {
            throw new PlatformProvisioningException(
                'Existing platform role [primary_administrator] is not protected; refusing to alter it silently.',
            );
        }

        $expectedIds = ScopedPermission::whereIn('key', self::PRIMARY_PERMISSIONS)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->sort()
            ->values()
            ->all();

        if (count($expectedIds) !== count(self::PRIMARY_PERMISSIONS)) {
            throw new PlatformProvisioningException(
                'Platform permission catalog is not synchronized; run PermissionCatalog::sync() before provisioning.',
            );
        }

        if ($role->wasRecentlyCreated) {
            $role->permissions()->attach($expectedIds);

            return $role->refresh();
        }

        $currentIds = $role->permissions()
            ->pluck('core_permissions.id')
            ->map(fn ($id): int => (int) $id)
            ->sort()
            ->values()
            ->all();

        if ($currentIds === $expectedIds) {
            return $role->refresh();
        }

        // Explicit reviewed expansions (C3-2, C5-2): a role
        // holding exactly a frozen previous approved set is
        // upgraded to the current approved set. Catalog
        // synchronization alone never reaches this point.
        foreach ([self::PRIMARY_PERMISSIONS_C2, self::PRIMARY_PERMISSIONS_C3_2] as $previousSet) {
            $previousIds = ScopedPermission::whereIn('key', $previousSet)
                ->pluck('id')
                ->map(fn ($id): int => (int) $id)
                ->sort()
                ->values()
                ->all();

            if ($currentIds === $previousIds) {
                $role->permissions()->attach(array_values(array_diff($expectedIds, $currentIds)));

                return $role->refresh();
            }
        }

        throw new PlatformProvisioningException(
            'Existing [primary_administrator] permission set differs from the approved set; refusing to change privileges silently.',
        );
    }
}
