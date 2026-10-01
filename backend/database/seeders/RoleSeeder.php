<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use RuntimeException;

/** Stable role keys, not assumed numeric IDs. Ordinary members never inherit admin grants. */
class RoleSeeder extends Seeder
{
    public const ROLES = [
        [
            'key' => 'admin',
            'name' => 'مدیر اصلی سیستم',
            'description' => 'مدیریت کامل سامانه، کاربران و مجوزها.',
            'color' => '#6366f1',
            'is_system' => true,
            'permissions' => '*',
        ],
        [
            'key' => 'team_member',
            'name' => 'کاربر',
            'description' => 'مشاهده وظایف و انجام کارهای ارجاع‌شده؛ سایر مجوزها توسط مدیر تعیین می‌شود.',
            'color' => '#64748b',
            'is_system' => false,
            'permissions' => ['tasks.view'],
        ],
    ];

    public function run(): void
    {
        $permissionIds = Permission::query()->pluck('id', 'key');

        foreach (self::ROLES as $definition) {
            $requested = $definition['permissions'] === '*' ? $permissionIds->keys()->all() : $definition['permissions'];
            if (array_diff($requested, $permissionIds->keys()->all()) !== []) {
                throw new RuntimeException('مجوزهای پایه کامل نیست؛ ابتدا PermissionSeeder را اجرا کنید.');
            }

            $role = Role::firstOrCreate(
                ['key' => $definition['key']],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                    'color' => $definition['color'],
                    'is_system' => $definition['is_system'],
                    'is_active' => true,
                ],
            );

            // Preserve edited ordinary roles and disabled roles on subsequent deployments.
            if ($role->wasRecentlyCreated || $definition['key'] === 'admin') {
                $role->permissions()->syncWithoutDetaching($permissionIds->only($requested)->values()->all());
            }
        }
    }
}
