<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $editId = DB::table('permissions')->where('key', 'content.edit')->value('id');
        $obsoleteIds = DB::table('permissions')->whereIn('key', ['content.manage_process', 'workflows.manage'])->pluck('id');
        if ($editId && $obsoleteIds->isNotEmpty()) {
            $roleIds = DB::table('permission_role')->whereIn('permission_id', $obsoleteIds)->pluck('role_id')->unique();
            foreach ($roleIds as $roleId) {
                DB::table('permission_role')->insertOrIgnore(['permission_id' => $editId, 'role_id' => $roleId]);
            }
            DB::table('permission_role')->whereIn('permission_id', $obsoleteIds)->delete();
        }
        DB::table('permissions')->whereIn('key', ['content.manage_process', 'workflows.manage'])->delete();
        DB::table('permissions')->where('key', 'content.edit')->update([
            'label' => 'ویرایش محتوا و جریان',
            'description' => 'ویرایش اطلاعات، وضعیت، مراحل جریان و مسئولان محتوا',
        ]);
    }

    public function down(): void
    {
        foreach ([
            ['key' => 'content.manage_process', 'label' => 'مدیریت فرآیند تولید محتوا', 'description' => 'تعریف و ویرایش مراحل گردش کار تولید محتوا و تعیین مسئول هر مرحله', 'category' => 'content'],
            ['key' => 'workflows.manage', 'label' => 'مدیریت گردش کارها', 'description' => 'مشاهده، ایجاد و ویرایش مراحل گردش کار', 'category' => 'workflows'],
        ] as $permission) {
            DB::table('permissions')->insertOrIgnore($permission);
        }
    }
};
