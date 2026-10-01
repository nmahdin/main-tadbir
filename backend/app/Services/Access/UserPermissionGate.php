<?php

namespace App\Services\Access;

use App\Models\User;

/**
 * One coarse permission gate for HTTP middleware and non-HTTP actors such as Bale.
 * Domain ownership/membership checks remain in their domain services.
 */
final class UserPermissionGate
{
    /** @param array<int, string>|string $permissions */
    public function any(?User $user, array|string $permissions): bool
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];

        return $user?->isActive() === true
            && $permissions !== []
            && $user->hasAnyPermission($permissions);
    }

    /** @param array<int, string>|string $permissions */
    public function all(?User $user, array|string $permissions): bool
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];

        return $user?->isActive() === true
            && $permissions !== []
            && collect($permissions)->every(fn (string $permission): bool => $user->hasPermission($permission));
    }

    /** @param array<int, string>|string $permissions */
    public function authorizeAny(?User $user, array|string $permissions): void
    {
        abort_unless($this->any($user, $permissions), 403, 'شما دسترسی لازم برای انجام این عملیات را ندارید.');
    }

    /** @param array<int, string>|string $permissions */
    public function authorizeAll(?User $user, array|string $permissions): void
    {
        abort_unless($this->all($user, $permissions), 403, 'شما دسترسی لازم برای انجام این عملیات را ندارید.');
    }
}
