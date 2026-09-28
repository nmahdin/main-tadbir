<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * کاربران پایه سامانه تدبیر.
 *
 * فقط یک «مدیر کل سیستم» به‌صورت سیستمی سید می‌شود؛
 * سایر کاربران به‌صورت دستی از داخل سامانه ساخته می‌شوند.
 *
 * رمز عبور پیش‌فرض «password» است و باید در اولین ورود تغییر کند.
 */
class UserSeeder extends Seeder
{
    /**
     * کلید هر عضو، شناسه همان کاربر در فرانت‌اند است تا سایر Seederها بتوانند
     * بدون وابستگی به شناسه عددی دیتابیس به کاربران ارجاع بدهند.
     *
     * @var array<string, array{name: string, username: string, email: string, role: string, status: string, title: string, department: string, phone: string, location: string, avatar: string, skills: array<int, string>}>
     */
    public const USERS = [
        'usr-1' => [
            'name' => 'سارا چنگیزی',
            'username' => 'sarah.changizi',
            'email' => 'sarah.changizi@tadbir.ir',
            'role' => 'admin',
            'status' => 'active',
            'title' => 'معاونت فنی و مدیریت محصول',
            'department' => 'executive',
            'phone' => '09123456789',
            'location' => 'تهران، ونک',
            'avatar' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
            'skills' => ['برنامه‌ریزی استراتژیک', 'معماری سیستم', 'اسکرام و چابک', 'نقشه راه محصول'],
        ],
    ];

    /**
     * نام کاربری متناظر با شناسه کاربر در فرانت‌اند (مثلاً usr-5).
     * سایر Seederها با همین متد به کاربران ارجاع می‌دهند.
     */
    public static function usernameFor(string $frontendId): ?string
    {
        return self::USERS[$frontendId]['username'] ?? self::USERS['usr-1']['username'];
    }

    public function run(): void
    {
        $namesBySlug = collect(DepartmentSeeder::DEPARTMENTS)->pluck('name', 'slug');
        $departmentIds = Department::query()->pluck('id', 'name');
        $roleIds = Role::query()->pluck('id', 'key');

        foreach (self::USERS as $definition) {
            $departmentName = $namesBySlug[$definition['department']] ?? null;

            User::updateOrCreate(
                ['username' => $definition['username']],
                [
                    'name' => $definition['name'],
                    'email' => $definition['email'],
                    'password' => 'password',
                    'avatar' => $definition['avatar'],
                    'role_id' => $roleIds[$definition['role']] ?? null,
                    'role_key' => $definition['role'],
                    'status' => $definition['status'],
                    'title' => $definition['title'],
                    'department_id' => $departmentName ? ($departmentIds[$departmentName] ?? null) : null,
                    'phone' => $definition['phone'],
                    'location' => $definition['location'],
                    'skills' => $definition['skills'],
                    'email_verified_at' => $definition['status'] === 'pending' ? null : now()->subDays(30),
                    'last_login_at' => $definition['status'] === 'active' ? now()->subHours(random_int(1, 72)) : null,
                ],
            );
        }
    }
}
