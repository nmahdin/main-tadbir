<?php

namespace App\Modules\Identity\Services;

use App\Core\Identity\LastActiveAdminGuard;
use App\Models\Role;
use App\Models\User;

/** Shared delegation ceiling for role editing and user-role assignment. */
final class AccessAdministration
{
    public function __construct(
        private readonly LastActiveAdminGuard $lastAdminGuard,
    ) {}

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
        $this->lastAdminGuard->lockAdminRole();
    }

    public function protectLastAdmin(User $target, array $attributes = [], bool $deleting = false): void
    {
        $this->lastAdminGuard->protectLastAdmin($target, $attributes, $deleting);
    }
}
