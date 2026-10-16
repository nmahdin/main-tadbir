<?php

namespace App\Core\Platform;

use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use Illuminate\Database\QueryException;

/**
 * Idempotent provisioning of the protected `primary_administrator`
 * platform role (Stage C2-1).
 *
 * The approved permission set below is exhaustive and frozen for
 * C2-1. Unlike RoleProvisioner for scoped roles (which re-aligns
 * protected roles on every run), repeat provisioning here VERIFIES
 * the existing definition and fails loudly on any difference:
 * privileges are never silently expanded or changed, and future
 * catalog keys reach this role only through an explicit, reviewed
 * change to this list.
 *
 * Provisioning creates the role definition only — it never assigns
 * the role to any user, so no legacy administrator is ever
 * automatically promoted.
 */
final class PlatformRoleProvisioner
{
    public const PRIMARY_ROLE_KEY = 'primary_administrator';

    /** @var list<string> Approved C2 initial permission set (frozen). */
    private const PRIMARY_PERMISSIONS = [
        'platform.admins.view',
        'platform.admins.manage',
        'platform.users.view',
        'platform.users.manage_status',
        'platform.organizations.view',
        'platform.audit.view',
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

        if ($currentIds !== $expectedIds) {
            throw new PlatformProvisioningException(
                'Existing [primary_administrator] permission set differs from the approved C2 set; refusing to change privileges silently.',
            );
        }

        return $role->refresh();
    }
}
