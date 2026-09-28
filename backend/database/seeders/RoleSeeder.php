<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * نقش‌های سازمانی سامانه تدبیر و ماتریس دسترسی هر نقش.
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
        [
            'key' => 'project_manager',
            'name' => 'مدیر ارشد پروژه (Project Manager)',
            'description' => 'اختیار کامل در ایجاد، زمان‌بندی و پایش پروژه‌ها، مدیریت وظایف تیم، مشاهده گزارش‌های تحلیلی و تخصیص منابع.',
            'color' => '#0ea5e9',
            'is_system' => true,
            'permissions' => [
                'users.view',
                'users.view_details',
                'roles.view',
                'projects.view',
                'projects.create',
                'projects.edit',
                'tasks.view',
                'tasks.create',
                'tasks.edit',
                'tasks.assign',
                'tasks.status',
                'tasks.delete',
                'teams.view',
                'teams.edit',
                'assets.view',
                'assets.preview',
                'assets.download',
                'assets.upload',
                'assets.edit_info',
                'assets.rename',
                'assets.move',
                'assets.create_version',
                'assets.share',
                'messaging.view',
                'messaging.create_chat',
                'messaging.send_message',
                'secretariat.view',
                'secretariat.create_letter',
                'secretariat.refer_letter',
                'secretariat.manage_resolutions',
                'thinktank.view',
                'thinktank.create_idea',
                'thinktank.manage_meetings',
                'thinktank.vote',
                'thinktank.approve_convert',
                'reports.view',
                'reports.export',
            ],
        ],
        [
            'key' => 'team_member',
            'name' => 'عضو تیم و متخصص فنی (Team Member)',
            'description' => 'مشاهده پروژه‌های منتسب، مدیریت وظایف واگذار شده، تغییر وضعیت، ثبت دیدگاه، ارتباطات و تبادل فایل.',
            'color' => '#10b981',
            'is_system' => true,
            'permissions' => [
                'users.view',
                'projects.view',
                'tasks.view',
                'tasks.status',
                'teams.view',
                'assets.view',
                'assets.preview',
                'assets.download',
                'assets.upload',
                'messaging.view',
                'messaging.send_message',
                'secretariat.view',
                'thinktank.view',
                'thinktank.create_idea',
                'thinktank.vote',
                'reports.view',
            ],
        ],
        [
            'key' => 'content_manager',
            'name' => 'مدیر محتوا (Content Manager)',
            'description' => 'مدیریت کامل فرایندهای محتوایی، ویرایش مراحل تولید محتوا، و تایید نهایی انتشار.',
            'color' => '#8b5cf6',
            'is_system' => true,
            'permissions' => [
                'content.view',
                'content.create',
                'content.edit',
                'content.delete',
                'content.publish',
                'content.manage_process',
            ],
        ],
        [
            'key' => 'qa_engineer',
            'name' => 'کارشناس تضمین کیفیت (QA Lead)',
            'description' => 'کنترل کیفیت خروجی‌ها، ثبت موانع و باگ‌های بحرانی، تست سناریوهای کاربری و تأیید نهایی وظایف.',
            'color' => '#f59e0b',
            'is_system' => false,
            'permissions' => [
                'users.view',
                'projects.view',
                'tasks.view',
                'tasks.create',
                'tasks.edit',
                'tasks.status',
                'assets.view',
                'assets.preview',
                'assets.download',
                'messaging.view',
                'messaging.send_message',
                'thinktank.view',
                'thinktank.create_idea',
                'thinktank.vote',
                'reports.view',
            ],
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
