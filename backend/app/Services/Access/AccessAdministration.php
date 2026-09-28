<?php

namespace App\Services\Access;

use App\Models\Role;
use App\Models\User;

/** Shared delegation ceiling for role editing and user-role assignment. */
final class AccessAdministration
{
    public function authorizeRole(User $actor, Role $role): void
    {
        if ($actor->isAdmin()) {
            return;
        }
        abort_if($role->is_system || in_array($role->key, ['admin', 'content_manager'], true), 403, 'مدیریت نقش سیستمی فقط برای مدیر سیستم مجاز است.');
        $this->authorizePermissions($actor, $role->permissions->pluck('key')->all());
    }

    public function authorizePermissions(User $actor, array $keys): void
    {
        abort_unless($actor->isAdmin() || $actor->hasPermission('roles.manage_permissions'), 403, 'مدیریت مجوزها نیازمند دسترسی مستقل است.');
        abort_unless($actor->isAdmin() || array_diff($keys, $actor->permissionKeys()) === [], 403, 'واگذاری مجوزی فراتر از دسترسی خودتان مجاز نیست.');
    }

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
