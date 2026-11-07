<?php

namespace App\Core\Platform;

use App\Core\Identity\AccountStatus;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;

/**
 * Platform-scope authorization evaluation (Stage C2-2).
 *
 * Deliberately separate from the workspace AuthorizationService:
 * platform authority derives solely from an ACTIVE platform role
 * assignment held by an operationally active account, and it never
 * resolves, implies, or satisfies organization/workspace
 * membership or permissions.
 *
 * Fail closed everywhere: non-active accounts, missing/revoked
 * assignments, and unknown or non-platform permission keys all
 * evaluate to no authority.
 */
final class PlatformAuthorizer
{
    public function activeAssignment(User $user): ?PlatformRoleAssignment
    {
        if (! $this->accountIsOperational($user)) {
            return null;
        }

        return PlatformRoleAssignment::query()
            ->where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->with('role')
            ->first();
    }

    /**
     * @return list<string>
     */
    public function permissionsFor(User $user): array
    {
        $assignment = $this->activeAssignment($user);
        if ($assignment === null) {
            return [];
        }

        return $assignment->role
            ->permissions()
            ->pluck('key')
            ->sort()
            ->values()
            ->all();
    }

    public function allows(User $user, string $permissionKey): bool
    {
        if (PermissionCatalog::scopeOf($permissionKey) !== PermissionCatalog::SCOPE_PLATFORM) {
            return false;
        }

        return in_array($permissionKey, $this->permissionsFor($user), true);
    }

    public function isPrimaryAdministrator(User $user): bool
    {
        $assignment = $this->activeAssignment($user);

        return $assignment !== null
            && $assignment->role->key === PlatformRoleProvisioner::PRIMARY_ROLE_KEY;
    }

    private function accountIsOperational(User $user): bool
    {
        return AccountStatus::of($user->status)?->allowsOperationalAccess() ?? false;
    }
}
