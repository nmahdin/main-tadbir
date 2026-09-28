<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * نقش‌های سازمانی سامانه تدبیر و ماتریس دسترسی هر نقش.
 *
 * در حال حاضر فقط نقش «مدیر کل سیستم» به‌صورت سیستمی سید می‌شود؛
 * سایر نقش‌ها به‌صورت دستی از داخل سامانه تعریف می‌شوند.
 *
 * ترتیب این فهرست، شناسه عددی نقش‌ها را تعیین می‌کند؛ بنابراین نقش مدیر کل سیستم
 * همیشه شناسه ۱ را می‌گیرد و کاربران سیستمی می‌توانند به آن ارجاع پایدار بدهند.
 */
class RoleSeeder extends Seeder
{
    /**
     * مقدار '*' یعنی همه دسترسی‌های تعریف‌شده در PermissionSeeder.
     *
     * @var array<int, array{key: string, name: string, description: string, color: string, is_system: bool, permissions: array<int, string>|string}>
     */
    public const ROLES = [
        [
            'key' => 'admin',
            'name' => 'مدیر کل سیستم (Super Admin)',
            'description' => 'دسترسی کامل و تام‌الاختیار به کلیه ماژول‌های سامانه تدبیر، مدیریت کاربران، نقش‌ها، پروژه‌ها و زیرساخت.',
            'color' => '#6366f1',
            'is_system' => true,
            // همه دسترسی‌های ثبت‌شده؛ معادل SYSTEM_PERMISSIONS.map(p => p.id) در فرانت‌اند
            'permissions' => '*',
        ],
    ];

    /**
     * نقش‌ها را ایجاد/به‌روزرسانی می‌کند و ماتریس دسترسی هر نقش را همگام می‌کند.
     */
    public function run(): void
    {
        $permissionIds = Permission::query()->pluck('id', 'key');
        $allKeys = $permissionIds->keys()->all();

        foreach (self::ROLES as $definition) {
            $role = Role::updateOrCreate(
                ['key' => $definition['key']],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                    'color' => $definition['color'],
                    'is_system' => $definition['is_system'],
                    'is_active' => true,
                ],
            );

            $requested = $definition['permissions'] === '*' ? $allKeys : $definition['permissions'];

            $unknown = array_values(array_diff($requested, $allKeys));
            if ($unknown !== []) {
                $this->command?->warn(sprintf(
                    'نقش %s: دسترسی‌های تعریف‌نشده نادیده گرفته شد: %s',
                    $role->key,
                    implode(', ', $unknown),
                ));
            }

            $role->permissions()->sync($permissionIds->only($requested)->values()->all());
        }
    }
}
