<?php

namespace App\Core\Identity;

use App\Models\Role;
use App\Models\User;

/**
 * Legacy last-active-system-admin invariant, shared by every account
 * demotion/deletion path (Core account lifecycle and the legacy user
 * administration endpoints in the Identity module).
 *
 * Lives in Core because the invariant is a platform guarantee, not a
 * module feature: Core must never depend on business modules, and the
 * delegation ceiling for role editing (AccessAdministration) stays in
 * the Identity module and delegates here, so the invariant has exactly
 * one implementation. All paths take the admin lock first, so two
 * administrators cannot concurrently remove the last active admin.
 */
final class LastActiveAdminGuard
{
    public function lockAdminRole(): void
    {
        // All account demotion/deletion paths take this same lock first, so two
        // administrators cannot concurrently remove the last active admin.
        Role::where('key', 'admin')->lockForUpdate()->first();
    }

    public function protectLastAdmin(User $target, array $attributes = [], bool $deleting = false): void
    {
        if ($target->role?->key !== 'admin' || ! $target->isActive()) {
            return;
        }
        $losesAdmin = $deleting
            || ($attributes['status'] ?? $target->status) !== 'active'
            || ($attributes['role_id'] ?? $target->role_id) !== $target->role_id;
        if ($losesAdmin) {
            $another = User::whereKeyNot($target->id)->where('status', 'active')
                ->whereHas('role', fn ($query) => $query->where('key', 'admin')->where('is_active', true))->exists();
            abort_unless($another, 422, 'حداقل یک مدیر فعال باید در سامانه باقی بماند.');
        }
    }
}
