<?php

namespace App\Core\Platform;

use App\Core\Audit\AuditWriter;
use App\Core\Rbac\GrantCeiling;
use App\Core\Rbac\RbacValidationException;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Platform role grant / soft-revoke / atomic replacement
 * (Stage C2-2). No HTTP surface exists yet (later C2 package);
 * these are the domain services future controllers will call.
 *
 * Every operation runs in one control-row-locked transaction and
 * writes its audit record inside that transaction:
 *  - the actor must hold `platform.admins.manage` (evaluated from
 *    their own active assignment; legacy admin status confers
 *    nothing here — no automatic elevation);
 *  - Grant Ceiling: the granted role's permission set may not
 *    exceed the actor's own effective platform keys;
 *  - self-modification is prohibited across grant, revoke and
 *    replace;
 *  - granting or replacing INTO `primary_administrator` requires
 *    the actor to be an eligible active Primary Administrator
 *    (who, holding the protected role, holds admins.manage);
 *  - revoke/replace may not remove the last usable Primary
 *    Administrator (PlatformPrimaryGuard, evaluated under the same
 *    control lock, so it cannot race).
 */
final class PlatformAssignmentService
{
    public function __construct(
        private readonly PlatformAuthorizer $authorizer,
        private readonly PlatformControlLock $controlLock,
        private readonly PlatformPrimaryGuard $primaryGuard,
        private readonly AuditWriter $audit,
    ) {}

    public function grant(User $actor, User $target, PlatformRole $role): PlatformRoleAssignment
    {
        $this->assertCanManageAdmins($actor);
        $this->assertNotSelf($actor, $target);
        $this->assertPrimaryGrantAuthority($actor, $role);
        GrantCeiling::assertWithinCeiling(
            $this->authorizer->permissionsFor($actor),
            $this->rolePermissionKeys($role),
            'platform',
        );

        return DB::transaction(function () use ($actor, $target, $role): PlatformRoleAssignment {
            $this->controlLock->lock();
            $lockedTarget = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $lockedRole = PlatformRole::whereKey($role->id)->lockForUpdate()->firstOrFail();

            if ($this->activeAssignmentOf($lockedTarget) !== null) {
                throw new RbacValidationException(
                    'The user already holds an active platform role; use replacement instead of grant.',
                );
            }

            $assignment = PlatformRoleAssignment::create([
                'user_id' => $lockedTarget->id,
                'platform_role_id' => $lockedRole->id,
                'granted_by_user_id' => $actor->id,
            ]);

            $this->audit->record($actor, 'platform.role_granted', [
                'role' => $lockedRole->key,
            ], 'platform', null, 'user', (int) $lockedTarget->id);

            return $assignment->refresh();
        });
    }

    public function revoke(User $actor, PlatformRoleAssignment $assignment): PlatformRoleAssignment
    {
        $this->assertCanManageAdmins($actor);

        return DB::transaction(function () use ($actor, $assignment): PlatformRoleAssignment {
            $this->controlLock->lock();
            $locked = PlatformRoleAssignment::whereKey($assignment->id)->lockForUpdate()->firstOrFail();
            $target = User::whereKey($locked->user_id)->lockForUpdate()->firstOrFail();

            $this->assertNotSelf($actor, $target);

            if ($locked->revoked_at !== null) {
                throw new RbacValidationException('This platform assignment is already revoked.');
            }

            if ($this->isPrimaryAssignment($locked)) {
                $this->primaryGuard->assertNotLastUsablePrimary($target);
            }

            $locked->forceFill([
                'revoked_at' => now(),
                'revoked_by_user_id' => $actor->id,
            ])->save();

            $this->audit->record($actor, 'platform.role_revoked', [
                'role' => $locked->role->key,
            ], 'platform', null, 'user', (int) $target->id);

            return $locked->refresh();
        });
    }

    /**
     * Atomic replacement: the previous assignment is soft-revoked
     * and the new one created in the same transaction; any failure
     * (ceiling, primary rules, guards) rolls both back.
     */
    public function replace(User $actor, User $target, PlatformRole $newRole): PlatformRoleAssignment
    {
        $this->assertCanManageAdmins($actor);
        $this->assertNotSelf($actor, $target);
        $this->assertPrimaryGrantAuthority($actor, $newRole);
        GrantCeiling::assertWithinCeiling(
            $this->authorizer->permissionsFor($actor),
            $this->rolePermissionKeys($newRole),
            'platform',
        );

        return DB::transaction(function () use ($actor, $target, $newRole): PlatformRoleAssignment {
            $this->controlLock->lock();
            $lockedTarget = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $lockedRole = PlatformRole::whereKey($newRole->id)->lockForUpdate()->firstOrFail();

            $current = $this->activeAssignmentOf($lockedTarget);
            if ($current === null) {
                throw new RbacValidationException(
                    'The user holds no active platform role; use grant instead of replacement.',
                );
            }

            $current->load('role');
            if ($this->isPrimaryAssignment($current) && $lockedRole->key !== PlatformRoleProvisioner::PRIMARY_ROLE_KEY) {
                $this->primaryGuard->assertNotLastUsablePrimary($lockedTarget);
            }

            $current->forceFill([
                'revoked_at' => now(),
                'revoked_by_user_id' => $actor->id,
            ])->save();

            $assignment = PlatformRoleAssignment::create([
                'user_id' => $lockedTarget->id,
                'platform_role_id' => $lockedRole->id,
                'granted_by_user_id' => $actor->id,
            ]);

            $this->audit->record($actor, 'platform.role_replaced', [
                'from_role' => $current->role->key,
                'to_role' => $lockedRole->key,
            ], 'platform', null, 'user', (int) $lockedTarget->id);

            return $assignment->refresh();
        });
    }

    private function activeAssignmentOf(User $user): ?PlatformRoleAssignment
    {
        return PlatformRoleAssignment::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->lockForUpdate()
            ->first();
    }

    private function isPrimaryAssignment(PlatformRoleAssignment $assignment): bool
    {
        $assignment->loadMissing('role');

        return $assignment->role->key === PlatformRoleProvisioner::PRIMARY_ROLE_KEY;
    }

    private function assertCanManageAdmins(User $actor): void
    {
        if (! $this->authorizer->allows($actor, 'platform.admins.manage')) {
            throw new PlatformAuthorizationException(
                'Platform administrator management requires platform.admins.manage.',
            );
        }
    }

    private function assertNotSelf(User $actor, User $target): void
    {
        if ((int) $actor->id === (int) $target->id) {
            throw new PlatformAuthorizationException(
                'Administrators cannot modify their own platform role.',
            );
        }
    }

    private function assertPrimaryGrantAuthority(User $actor, PlatformRole $role): void
    {
        if ($role->key !== PlatformRoleProvisioner::PRIMARY_ROLE_KEY) {
            return;
        }

        if (! $this->authorizer->isPrimaryAdministrator($actor)) {
            throw new PlatformAuthorizationException(
                'Only an eligible active Primary Administrator may grant the primary role.',
            );
        }
    }

    /**
     * @return list<string>
     */
    private function rolePermissionKeys(PlatformRole $role): array
    {
        return $role->permissions()->pluck('key')->all();
    }
}
