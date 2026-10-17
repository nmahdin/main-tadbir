<?php

namespace App\Core\Platform;

use App\Core\Audit\AuditWriter;
use App\Core\Rbac\GrantCeiling;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedPermission;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Database-managed custom platform roles (Stage C2-2).
 *
 * Rules enforced on every mutation (inside a control-row-locked
 * transaction, audited in the same transaction):
 *  - the actor must hold `platform.admins.manage`;
 *  - only platform-scope catalog keys may be attached
 *    (PermissionCatalog rejects unknown/cross-scope keys with 422);
 *  - Grant Ceiling: a role's key set may never exceed the actor's
 *    own effective platform keys — permission edits affect every
 *    assignee, so they are ceiling-checked exactly like grants;
 *  - the protected `primary_administrator` role can never be
 *    edited or deleted through these services;
 *  - an actor may not edit the permissions of a role they
 *    themselves actively hold (self-modification);
 *  - a role with assignment history (active or revoked) cannot be
 *    deleted; its permission links must be detached by deletion of
 *    the role itself only when no history exists.
 */
final class PlatformRoleService
{
    public function __construct(
        private readonly PlatformAuthorizer $authorizer,
        private readonly PlatformControlLock $controlLock,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * @param  list<string>  $permissionKeys
     */
    public function createCustomRole(User $actor, string $key, string $name, array $permissionKeys, ?string $description = null): PlatformRole
    {
        $this->assertCanManageRoles($actor);
        PermissionCatalog::assertKnownKeysForScope($permissionKeys, PermissionCatalog::SCOPE_PLATFORM);
        GrantCeiling::assertWithinCeiling($this->authorizer->permissionsFor($actor), $permissionKeys, 'platform');

        return DB::transaction(function () use ($actor, $key, $name, $permissionKeys, $description): PlatformRole {
            $this->controlLock->lock();

            if (PlatformRole::where('key', $key)->exists()) {
                throw new RbacValidationException("Platform role key [{$key}] already exists.");
            }

            $role = PlatformRole::create([
                'key' => $key,
                'name' => $name,
                'description' => $description,
                'is_protected' => false,
            ]);
            $role->permissions()->attach($this->permissionIds($permissionKeys));

            $this->audit->record($actor, 'platform.role_created', [
                'role' => $key,
                'permissions' => $permissionKeys,
            ], 'platform', null, 'platform_role', (int) $role->id);

            return $role->refresh();
        });
    }

    /**
     * @param  list<string>  $permissionKeys
     */
    public function updateRolePermissions(User $actor, PlatformRole $role, array $permissionKeys): PlatformRole
    {
        $this->assertCanManageRoles($actor);
        PermissionCatalog::assertKnownKeysForScope($permissionKeys, PermissionCatalog::SCOPE_PLATFORM);
        GrantCeiling::assertWithinCeiling($this->authorizer->permissionsFor($actor), $permissionKeys, 'platform');

        return DB::transaction(function () use ($actor, $role, $permissionKeys): PlatformRole {
            $this->controlLock->lock();
            $locked = PlatformRole::whereKey($role->id)->lockForUpdate()->firstOrFail();
            $this->assertNotProtected($locked);
            $this->assertActorDoesNotHold($actor, $locked);

            $previous = $locked->permissions()->pluck('key')->sort()->values()->all();
            $locked->permissions()->sync($this->permissionIds($permissionKeys));

            $this->audit->record($actor, 'platform.role_permissions_updated', [
                'role' => $locked->key,
                'from' => $previous,
                'to' => collect($permissionKeys)->sort()->values()->all(),
            ], 'platform', null, 'platform_role', (int) $locked->id);

            return $locked->refresh();
        });
    }

    /**
     * Atomic metadata + permission update with optimistic
     * concurrency (Stage C2-3). The caller's expected version must
     * match the stored role; a stale update is rejected with
     * PlatformVersionConflictException (HTTP 409) and changes
     * nothing. Successful updates increment the version.
     *
     * @param  list<string>|null  $permissionKeys
     */
    public function updateCustomRole(User $actor, PlatformRole $role, ?string $name, ?string $description, ?array $permissionKeys, int $expectedVersion): PlatformRole
    {
        $this->assertCanManageRoles($actor);
        if ($permissionKeys !== null) {
            PermissionCatalog::assertKnownKeysForScope($permissionKeys, PermissionCatalog::SCOPE_PLATFORM);
            GrantCeiling::assertWithinCeiling($this->authorizer->permissionsFor($actor), $permissionKeys, 'platform');
        }

        return DB::transaction(function () use ($actor, $role, $name, $description, $permissionKeys, $expectedVersion): PlatformRole {
            $this->controlLock->lock();
            $locked = PlatformRole::whereKey($role->id)->lockForUpdate()->firstOrFail();
            $this->assertNotProtected($locked);

            if ((int) $locked->version !== $expectedVersion) {
                throw new PlatformVersionConflictException(
                    "Platform role [{$locked->key}] was modified concurrently; reload before updating.",
                );
            }

            if ($permissionKeys !== null) {
                $this->assertActorDoesNotHold($actor, $locked);
                $locked->permissions()->sync($this->permissionIds($permissionKeys));
            }
            if ($name !== null) {
                $locked->name = $name;
            }
            if ($description !== null) {
                $locked->description = $description;
            }
            $locked->version = (int) $locked->version + 1;
            $locked->save();

            $this->audit->record($actor, 'platform.role_updated', [
                'role' => $locked->key,
                'version' => (int) $locked->version,
                'permissions' => $permissionKeys,
            ], 'platform', null, 'platform_role', (int) $locked->id);

            return $locked->refresh();
        });
    }

    public function deleteRole(User $actor, PlatformRole $role): void
    {
        $this->assertCanManageRoles($actor);

        DB::transaction(function () use ($actor, $role): void {
            $this->controlLock->lock();
            $locked = PlatformRole::whereKey($role->id)->lockForUpdate()->firstOrFail();
            $this->assertNotProtected($locked);
            $this->assertActorDoesNotHold($actor, $locked);

            if ($locked->assignments()->exists()) {
                throw new RbacValidationException(
                    'A platform role with assignment history cannot be deleted.',
                );
            }

            $key = $locked->key;
            $locked->permissions()->detach();
            $locked->delete();

            $this->audit->record($actor, 'platform.role_deleted', [
                'role' => $key,
            ], 'platform', null, 'platform_role', (int) $role->id);
        });
    }

    private function assertCanManageRoles(User $actor): void
    {
        if (! $this->authorizer->allows($actor, 'platform.admins.manage')) {
            throw new PlatformAuthorizationException(
                'Platform role management requires platform.admins.manage.',
            );
        }
    }

    private function assertNotProtected(PlatformRole $role): void
    {
        if ($role->is_protected) {
            throw new RbacValidationException(
                'Protected platform roles cannot be edited or deleted through role services.',
            );
        }
    }

    private function assertActorDoesNotHold(User $actor, PlatformRole $role): void
    {
        $held = $this->authorizer->activeAssignment($actor);
        if ($held !== null && (int) $held->platform_role_id === (int) $role->id) {
            throw new PlatformAuthorizationException(
                'Administrators cannot modify a platform role they themselves hold.',
            );
        }
    }

    /**
     * @param  list<string>  $permissionKeys
     * @return list<int>
     */
    private function permissionIds(array $permissionKeys): array
    {
        return ScopedPermission::whereIn('key', $permissionKeys)
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }
}
