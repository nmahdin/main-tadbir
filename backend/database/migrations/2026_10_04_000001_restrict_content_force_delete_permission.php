<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Correct the initial workflow-permission backfill: permanent deletion is not a
 * consequence of any ordinary content grant. Only the real admin role receives
 * it by default; the permission matrix may explicitly grant it again later.
 */
return new class extends Migration
{
    public function up(): void
    {
        $permission = Permission::query()->updateOrCreate(
            ['key' => 'content.force_delete'],
            [
                'label' => 'حذف دائمی محتوا',
                'description' => 'حذف نهایی پرونده محتوا با تأیید صریح و ثبت در گزارش عملیات',
                'category' => 'content',
            ],
        );

        $adminRoleIds = Role::query()->where('key', 'admin')->pluck('id');
        DB::table('permission_role')
            ->where('permission_id', $permission->id)
            ->when($adminRoleIds->isNotEmpty(), fn ($query) => $query->whereNotIn('role_id', $adminRoleIds))
            ->when($adminRoleIds->isEmpty(), fn ($query) => $query)
            ->delete();

        foreach ($adminRoleIds as $roleId) {
            DB::table('permission_role')->insertOrIgnore([
                'permission_id' => $permission->id,
                'role_id' => $roleId,
            ]);
        }
    }

    public function down(): void
    {
        // Deliberately do not broaden this destructive permission on rollback.
    }
};
