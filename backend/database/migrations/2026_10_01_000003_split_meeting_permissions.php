<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            ['key' => 'meetings.view', 'label' => 'مشاهده جلسات', 'description' => 'مشاهده فهرست و جزئیات جلسات', 'category' => 'meetings'],
            ['key' => 'meetings.create', 'label' => 'ایجاد جلسه', 'description' => 'برنامه‌ریزی جلسه و دعوت اعضا', 'category' => 'meetings'],
            ['key' => 'meetings.edit', 'label' => 'ویرایش جلسه', 'description' => 'ویرایش برنامه، زمان و اعضای جلسه', 'category' => 'meetings'],
            ['key' => 'meetings.minutes', 'label' => 'ثبت صورت‌جلسه', 'description' => 'ثبت حاضرین، غایبین، مصوبات و اقدامات جلسه', 'category' => 'meetings'],
            ['key' => 'meetings.delete', 'label' => 'حذف جلسه', 'description' => 'حذف جلسات برنامه‌ریزی‌شده', 'category' => 'meetings'],
        ];
        foreach ($rows as $row) {
            DB::table('permissions')->updateOrInsert(['key' => $row['key']], $row);
        }

        $viewSource = DB::table('permissions')->where('key', 'thinktank.view')->value('id');
        $manageSource = DB::table('permissions')->where('key', 'thinktank.manage_meetings')->value('id');
        $viewTarget = DB::table('permissions')->where('key', 'meetings.view')->value('id');
        $targets = DB::table('permissions')->whereIn('key', ['meetings.create', 'meetings.edit', 'meetings.minutes', 'meetings.delete'])->pluck('id');
        if ($viewSource && $viewTarget) {
            foreach (DB::table('permission_role')->where('permission_id', $viewSource)->pluck('role_id') as $roleId) {
                DB::table('permission_role')->insertOrIgnore(['permission_id' => $viewTarget, 'role_id' => $roleId]);
            }
        }
        if ($manageSource) {
            foreach (DB::table('permission_role')->where('permission_id', $manageSource)->pluck('role_id') as $roleId) {
                foreach ($targets->push($viewTarget)->filter()->unique() as $permissionId) {
                    DB::table('permission_role')->insertOrIgnore(['permission_id' => $permissionId, 'role_id' => $roleId]);
                }
            }
            DB::table('permission_role')->where('permission_id', $manageSource)->delete();
            DB::table('permissions')->where('id', $manageSource)->delete();
        }
        DB::table('permissions')->where('key', 'thinktank.view')->update([
            'label' => 'مشاهده اتاق فکر و ایده‌ها',
            'description' => 'دسترسی به ویترین ایده‌ها و چالش‌ها',
        ]);
    }

    public function down(): void
    {
        DB::table('permissions')->whereIn('key', ['meetings.view', 'meetings.create', 'meetings.edit', 'meetings.minutes', 'meetings.delete'])->delete();
        DB::table('permissions')->insertOrIgnore([
            'key' => 'thinktank.manage_meetings', 'label' => 'برگزاری و مدیریت جلسات هم‌اندیشی',
            'description' => 'تعریف جلسه بارش فکری، ثبت صورتجلسه و تصمیمات', 'category' => 'thinktank',
        ]);
    }
};
