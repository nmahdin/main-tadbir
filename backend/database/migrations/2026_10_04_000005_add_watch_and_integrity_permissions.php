<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $definitions = [
            'content.watch' => ['label' => 'دنبال‌کردن محتوای در دسترس', 'description' => 'دریافت اعلان رویدادهای مهم محتوایی که کاربر از قبل به آن دسترسی دارد', 'category' => 'content'],
            'integrity.view' => ['label' => 'مشاهده پایش یکپارچگی', 'description' => 'مشاهده گزارش فقط‌خواندنی ناسازگاری‌های عملیاتی', 'category' => 'settings'],
        ];
        foreach ($definitions as $key => $attributes) {
            Permission::query()->updateOrCreate(['key' => $key], $attributes);
        }

        $watchId = Permission::where('key', 'content.watch')->value('id');
        $managerialIds = Permission::whereIn('key', ['content.edit', 'content.approve', 'content.publish', 'projects.edit'])->pluck('id');
        if ($watchId && $managerialIds->isNotEmpty()) {
            foreach (DB::table('permission_role')->whereIn('permission_id', $managerialIds)->pluck('role_id')->unique() as $roleId) {
                DB::table('permission_role')->insertOrIgnore(['permission_id' => $watchId, 'role_id' => $roleId]);
            }
        }
        if ($watchId) {
            Role::where('key', 'admin')->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$watchId]));
        }

        $integrityId = Permission::where('key', 'integrity.view')->value('id');
        $settingsId = Permission::where('key', 'settings.manage')->value('id');
        if ($integrityId && $settingsId) {
            foreach (DB::table('permission_role')->where('permission_id', $settingsId)->pluck('role_id')->unique() as $roleId) {
                DB::table('permission_role')->insertOrIgnore(['permission_id' => $integrityId, 'role_id' => $roleId]);
            }
        }
        if ($integrityId) {
            Role::where('key', 'admin')->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$integrityId]));
        }
    }

    public function down(): void
    {
        $ids = Permission::whereIn('key', ['content.watch', 'integrity.view'])->pluck('id');
        DB::table('permission_role')->whereIn('permission_id', $ids)->delete();
        Permission::whereIn('id', $ids)->delete();
    }
};
