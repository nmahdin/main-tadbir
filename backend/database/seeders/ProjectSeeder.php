<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\ProjectTemplate;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * پروژه‌های نمونه سامانه تدبیر (INITIAL_PROJECTS در فرانت‌اند).
 *
 * کلید پروژه (مثل SYNC یا AUTH) به عنوان شناسه طبیعی استفاده می‌شود تا Seederهای
 * دیگر (وظایف و رویدادها) بتوانند بدون وابستگی به شناسه عددی به پروژه ارجاع دهند.
 */
class ProjectSeeder extends Seeder
{
    /**
     * @var array<int, array{key: string, name: string, description: string, manager: string, start_date: string, deadline: string, status: string, progress: int, priority: string, tags: array<int, string>, color: string, budget: string, category: string, template: string|null, members: array<int, string>}>
     */
    public const PROJECTS = [
        [
            'key' => 'SYNC',
            'name' => 'بازطراحی پرتال ابری کلود‌سینک ۲.۰',
            'description' => 'بازطراحی کامل تجربه کاربری و معماری پرتال ابری، مهاجرت به React 19 و پیاده‌سازی برد کانبان تعاملی.',
            'manager' => 'usr-2',
            'start_date' => '2026-08-01',
            'deadline' => '2026-09-30',
            'status' => 'active',
            'progress' => 68,
            'priority' => 'urgent',
            'tags' => ['فرانت‌اند', 'بازطراحی', 'React 19', 'تجربه کاربری'],
            'color' => '#6366f1',
            'budget' => '۲۵۰,۰۰۰,۰۰۰ تومان',
            'category' => 'توسعه محصول',
            'template' => 'اسپرینت توسعه چابک نرم‌افزار (Scrum Software Sprint)',
            'members' => ['usr-1', 'usr-2', 'usr-3', 'usr-4', 'usr-5', 'usr-6'],
        ],
        [
            'key' => 'AUTH',
            'name' => 'گیت‌وی امنیتی API و احراز هویت سازمانی',
            'description' => 'پیاده‌سازی احراز هویت مبتنی بر توکن، ورود دو مرحله‌ای، ماتریس دسترسی نقش‌محور و ممیزی امنیتی وب‌سرویس‌ها.',
            'manager' => 'usr-2',
            'start_date' => '2026-08-10',
            'deadline' => '2026-10-15',
            'status' => 'active',
            'progress' => 45,
            'priority' => 'high',
            'tags' => ['امنیت', 'احراز هویت', 'API', 'RBAC'],
            'color' => '#0ea5e9',
            'budget' => '۱۸۰,۰۰۰,۰۰۰ تومان',
            'category' => 'زیرساخت ابری',
            'template' => 'ممیزی امنیت و تست نفوذ دوره‌ای (Security Audit & Hardening)',
            'members' => ['usr-1', 'usr-2', 'usr-4', 'usr-6'],
        ],
        [
            'key' => 'MOBI',
            'name' => 'اپلیکیشن موبایل اندروید و iOS نسخه ۳.۰',
            'description' => 'نسخه جدید اپلیکیشن موبایل با معماری آفلاین‌محور، اعلان‌های لحظه‌ای و همگام‌سازی کامل با پرتال وب.',
            'manager' => 'usr-1',
            'start_date' => '2026-09-01',
            'deadline' => '2026-11-20',
            'status' => 'planning',
            'progress' => 15,
            'priority' => 'medium',
            'tags' => ['موبایل', 'React Native', 'اعلان‌ها'],
            'color' => '#8b5cf6',
            'budget' => '۳۰۰,۰۰۰,۰۰۰ تومان',
            'category' => 'اپلیکیشن موبایل',
            'template' => 'اسپرینت توسعه چابک نرم‌افزار (Scrum Software Sprint)',
            'members' => ['usr-1', 'usr-3', 'usr-5'],
        ],
        [
            'key' => 'DATA',
            'name' => 'سامانه تحلیل داده و پیش‌بینی بار کاری تیم',
            'description' => 'توسعه داشبوردهای تحلیلی، محاسبه ظرفیت واقعی اعضا و پیش‌بینی ریسک تأخیر بر اساس داده‌های تاریخی پروژه‌ها.',
            'manager' => 'usr-2',
            'start_date' => '2026-07-15',
            'deadline' => '2026-09-10',
            'status' => 'active',
            'progress' => 82,
            'priority' => 'high',
            'tags' => ['تحلیل داده', 'BI', 'نمودارها'],
            'color' => '#10b981',
            'budget' => '۱۴۰,۰۰۰,۰۰۰ تومان',
            'category' => 'علم داده و هوش تجاری',
            'template' => 'اسپرینت توسعه چابک نرم‌افزار (Scrum Software Sprint)',
            'members' => ['usr-2', 'usr-4', 'usr-5'],
        ],
        [
            'key' => 'DOCS',
            'name' => 'پرتال مستندات و آنبوردینگ مشتریان',
            'description' => 'راه‌اندازی پرتال مستندات فنی و راهنمای آنبوردینگ مشتریان همراه با سندباکس تعاملی API.',
            'manager' => 'usr-1',
            'start_date' => '2026-06-01',
            'deadline' => '2026-08-20',
            'status' => 'completed',
            'progress' => 100,
            'priority' => 'low',
            'tags' => ['مستندات', 'OpenAPI', 'تجربه توسعه‌دهنده'],
            'color' => '#f59e0b',
            'budget' => '۶۰,۰۰۰,۰۰۰ تومان',
            'category' => 'رشد و خدمات مشتریان',
            'template' => null,
            'members' => ['usr-1', 'usr-3', 'usr-5'],
        ],
    ];

    public function run(): void
    {
        $userIds = User::query()->pluck('id', 'username');
        $templateIds = ProjectTemplate::query()->pluck('id', 'name');

        foreach (self::PROJECTS as $definition) {
            $project = Project::updateOrCreate(
                ['key' => $definition['key']],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                    'project_manager_id' => $userIds[UserSeeder::usernameFor($definition['manager'])] ?? null,
                    'start_date' => $definition['start_date'],
                    'deadline' => $definition['deadline'],
                    'status' => $definition['status'],
                    'progress' => $definition['progress'],
                    'priority' => $definition['priority'],
                    'tags' => $definition['tags'],
                    'color' => $definition['color'],
                    'budget' => $definition['budget'],
                    'category' => $definition['category'],
                    'template_id' => $definition['template'] ? ($templateIds[$definition['template']] ?? null) : null,
                ],
            );

            $members = [];
            foreach ($definition['members'] as $frontendId) {
                $userId = $userIds[UserSeeder::usernameFor($frontendId)] ?? null;

                if ($userId === null) {
                    $this->command?->warn("کاربر {$frontendId} یافت نشد و به پروژه «{$project->name}» اضافه نشد.");

                    continue;
                }

                $members[$userId] = ['joined_at' => now()];
            }

            $project->members()->sync($members);
        }
    }
}
