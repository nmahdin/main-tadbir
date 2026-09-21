<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * وظایف نمونه به همراه دیدگاه‌ها و فایل‌های پیوست (INITIAL_TASKS در فرانت‌اند).
 *
 * زیروظیفه‌ها (subtasks) در فرانت‌اند به صورت آرایه JSON نگهداری می‌شوند و هنوز جدول
 * اختصاصی در دیتابیس ندارند؛ در فاز اتصال API تصمیم‌گیری می‌شود که به جدول جدا
 * منتقل شوند یا در ستون JSON بمانند.
 */
class TaskSeeder extends Seeder
{
    /**
     * @var array<int, array<string, mixed>>
     */
    public const TASKS = [
        [
            'title' => 'طراحی رابط کاربری ورود و مراحل آنبوردینگ در فیگما',
            'description' => 'تولید کامپوننت‌های فیگما برای صفحات ورود، احراز هویت دو مرحله‌ای (2FA)، مودال دعوت از همکاران و بازیابی گذرواژه همراه با کلیه حالت‌های اعتبارسنجی.',
            'project' => 'SYNC',
            'assignee' => 'usr-5',
            'priority' => 'urgent',
            'status' => 'in_progress',
            'start_date' => '2026-08-24',
            'deadline' => '2026-09-02',
            'estimated_hours' => 24,
            'logged_hours' => 18,
            'tags' => ['UI/UX', 'Figma', 'احراز هویت'],
            'comments' => [
                ['user' => 'usr-2', 'text' => 'لطفاً اطمینان حاصل کنید که توکن‌های حالت شب و روز به طور هماهنگ خروجی گرفته شوند.', 'at' => '2026-08-28 14:30:00'],
                ['user' => 'usr-5', 'text' => 'توکن‌ها با تنظیمات Tailwind و متغیرهای رنگی کاملاً هماهنگ شدند.', 'at' => '2026-08-29 09:05:00'],
            ],
            'attachments' => [
                ['name' => 'Auth_Flow_Architecture_v2.fig', 'size' => '۱۴.۲ مگابایت', 'type' => 'figma', 'url' => 'https://assets.tadbir.local/attachments/Auth_Flow_Architecture_v2.fig', 'uploaded_by' => 'usr-5'],
            ],
        ],
        [
            'title' => 'پیاده‌سازی برد کانبان تعاملی با کشیدن و رها کردن (Drag & Drop)',
            'description' => 'ساخت برد کانبان چابک با پشتیبانی از کشیدن کارت‌ها بین ستون‌ها، انیمیشن‌های روان، هشدار سقف کار در جریان (WIP) و فیلترهای پیشرفته.',
            'project' => 'SYNC',
            'assignee' => 'usr-3',
            'priority' => 'urgent',
            'status' => 'in_progress',
            'start_date' => '2026-08-26',
            'deadline' => '2026-09-04',
            'estimated_hours' => 32,
            'logged_hours' => 22,
            'tags' => ['فرانت‌اند', 'کانبان', 'React 19', 'انیمیشن'],
            'comments' => [
                ['user' => 'usr-3', 'text' => 'انیمیشن‌های برد با فریم‌ریت عالی پیاده شدند و حالت‌های مختلف تست شدند.', 'at' => '2026-08-30 16:40:00'],
            ],
            'attachments' => [],
        ],
        [
            'title' => 'رفع خطای انقضای توکن JWT در اتصال وب‌سوکت',
            'description' => 'رفع باگ بحرانی: در صورت انقضای توکن، اتصال وب‌سوکت در حلقه قطع و وصل مداوم می‌افتد و وضعیت همکاری زنده متوقف می‌شود.',
            'project' => 'AUTH',
            'assignee' => 'usr-4',
            'priority' => 'urgent',
            'status' => 'in_progress',
            'start_date' => '2026-08-28',
            'deadline' => '2026-08-30',
            'estimated_hours' => 12,
            'logged_hours' => 14,
            'tags' => ['بک‌اند', 'امنیت', 'باگ', 'وب‌سوکت'],
            'is_blocked' => true,
            'blocked_reason' => 'در انتظار تمدید گواهینامه امنیتی سرور استیجینگ توسط تیم دوآپس',
            'comments' => [
                ['user' => 'usr-6', 'text' => 'تست‌های رگرسیون شبانه این مورد را ثبت کردند. پچ آماده بررسی است.', 'at' => '2026-08-31 08:15:00'],
            ],
            'attachments' => [],
        ],
        [
            'title' => 'پیکربندی تست‌های رگرسیون End-to-End با Playwright',
            'description' => 'راه‌اندازی سناریوهای آزمون خودکار برای جریان ایجاد پروژه، محدودیت‌های دسترسی نقش‌ها و کشیدن تسک‌ها در پایپ‌لاین CI/CD.',
            'project' => 'SYNC',
            'assignee' => 'usr-6',
            'priority' => 'medium',
            'status' => 'todo',
            'start_date' => '2026-08-31',
            'deadline' => '2026-09-08',
            'estimated_hours' => 20,
            'logged_hours' => 0,
            'tags' => ['تضمین کیفیت', 'Playwright', 'CI/CD'],
            'comments' => [],
            'attachments' => [],
        ],
        [
            'title' => 'توسعه رادار توزیع بار کاری و ظرفیت اعضای تیم',
            'description' => 'ایجاد کامپوننت تحلیلی محاسبه ظرفیت کاری بر اساس ساعات تخمینی تسک‌های فعال در برابر سقف هفتگی هر عضو تیم.',
            'project' => 'DATA',
            'assignee' => 'usr-3',
            'priority' => 'high',
            'status' => 'review',
            'start_date' => '2026-08-20',
            'deadline' => '2026-09-03',
            'estimated_hours' => 28,
            'logged_hours' => 26,
            'tags' => ['تحلیل داده', 'نمودارها', 'فرانت‌اند'],
            'comments' => [
                ['user' => 'usr-2', 'text' => 'بسیار عالی طراحی شده. پول‌ریکوئست را بررسی کردم و بازخوردها ثبت شدند.', 'at' => '2026-09-01 11:20:00'],
            ],
            'attachments' => [],
        ],
        [
            'title' => 'بهینه‌سازی ایندکس‌های دیتابیس برای کوئری‌های زیر ۱۰ میلی‌ثانیه',
            'description' => 'بهینه‌سازی ایندکس‌های ترکیبی PostgreSQL روی وضعیت و مهلت تسک‌ها و تنظیم استخر اتصالات خواندن (Read Replica).',
            'project' => 'AUTH',
            'assignee' => 'usr-4',
            'priority' => 'high',
            'status' => 'completed',
            'start_date' => '2026-08-15',
            'deadline' => '2026-08-25',
            'estimated_hours' => 16,
            'logged_hours' => 15,
            'tags' => ['دیتابیس', 'PostgreSQL', 'کارایی'],
            'comments' => [
                ['user' => 'usr-4', 'text' => 'زمان کوئری P99 از ۱۴۵ میلی‌ثانیه به ۴.۲ میلی‌ثانیه کاهش پیدا کرد.', 'at' => '2026-08-24 19:45:00'],
            ],
            'attachments' => [],
        ],
        [
            'title' => 'راه‌اندازی سرویس پوش نوتیفیکیشن موبایل (FCM & APNs)',
            'description' => 'پیکربندی ارسال اعلان‌های لحظه‌ای برای واگذاری تسک‌ها، یادآوری مهلت‌های نزدیک و منشن شدن در دیدگاه‌ها.',
            'project' => 'MOBI',
            'assignee' => 'usr-3',
            'priority' => 'medium',
            'status' => 'backlog',
            'start_date' => '2026-09-05',
            'deadline' => '2026-09-18',
            'estimated_hours' => 24,
            'logged_hours' => 0,
            'tags' => ['موبایل', 'اعلان‌ها', 'FCM'],
            'comments' => [],
            'attachments' => [],
        ],
        [
            'title' => 'ممیزی و سخت‌گیری دسترسی‌های نقش‌محور (RBAC)',
            'description' => 'آزمون و تایید مرزهای دسترسی مدیر ارشد، مدیر پروژه و اعضای عادی در تمام عملیات حساس و تب‌های سامانه.',
            'project' => 'AUTH',
            'assignee' => 'usr-6',
            'priority' => 'high',
            'status' => 'completed',
            'start_date' => '2026-08-18',
            'deadline' => '2026-08-28',
            'estimated_hours' => 18,
            'logged_hours' => 18,
            'tags' => ['امنیت', 'RBAC', 'ممیزی'],
            'comments' => [],
            'attachments' => [],
        ],
        [
            'title' => 'پیاده‌سازی تقویم زمان‌بندی جامع با نمای ماهانه و هفتگی',
            'description' => 'نمایش ماتریس تحویل پروژه‌ها، اسپرینت‌ها و ددلاین تسک‌ها با برچسب‌های رنگی و فیلترهای سریع.',
            'project' => 'SYNC',
            'assignee' => 'usr-3',
            'priority' => 'medium',
            'status' => 'todo',
            'start_date' => '2026-09-01',
            'deadline' => '2026-09-12',
            'estimated_hours' => 20,
            'logged_hours' => 0,
            'tags' => ['فرانت‌اند', 'تقویم', 'تایم‌لاین'],
            'comments' => [],
            'attachments' => [],
        ],
        [
            'title' => 'انتشار مستندات تعاملی Swagger و محیط سندباکس API',
            'description' => 'تولید مشخصات OpenAPI 3.1، نمونه کدهای فراخوانی در TypeScript و پایتون و استقرار پرتال خودکار توسعه‌دهندگان.',
            'project' => 'DOCS',
            'assignee' => 'usr-4',
            'priority' => 'low',
            'status' => 'completed',
            'start_date' => '2026-07-01',
            'deadline' => '2026-08-15',
            'estimated_hours' => 30,
            'logged_hours' => 28,
            'tags' => ['مستندات', 'OpenAPI', 'تجربه توسعه‌دهنده'],
            'comments' => [],
            'attachments' => [],
        ],
    ];

    public function run(): void
    {
        $userIds = User::query()->pluck('id', 'username');
        $projectIds = Project::query()->pluck('id', 'key');

        foreach (self::TASKS as $definition) {
            $task = Task::updateOrCreate(
                ['title' => $definition['title']],
                [
                    'description' => $definition['description'],
                    'project_id' => $projectIds[$definition['project']],
                    'assignee_id' => $userIds[UserSeeder::usernameFor($definition['assignee'])] ?? null,
                    'priority' => $definition['priority'],
                    'status' => $definition['status'],
                    'start_date' => $definition['start_date'],
                    'deadline' => $definition['deadline'],
                    'estimated_hours' => $definition['estimated_hours'],
                    'logged_hours' => $definition['logged_hours'],
                    'tags' => $definition['tags'],
                    'is_blocked' => $definition['is_blocked'] ?? false,
                    'blocked_reason' => $definition['blocked_reason'] ?? null,
                ],
            );

            // دیدگاه‌ها و پیوست‌ها در هر اجرا از نو ساخته می‌شوند تا Seeder تکرارپذیر بماند.
            $task->comments()->delete();
            $task->attachments()->delete();

            foreach ($definition['comments'] as $comment) {
                $record = $task->comments()->make([
                    'user_id' => $userIds[UserSeeder::usernameFor($comment['user'])] ?? null,
                    'text' => $comment['text'],
                ]);
                $record->created_at = $comment['at'];
                $record->updated_at = $comment['at'];
                $record->save();
            }

            foreach ($definition['attachments'] as $attachment) {
                $task->attachments()->create([
                    'name' => $attachment['name'],
                    'size' => $attachment['size'],
                    'type' => $attachment['type'],
                    'url' => $attachment['url'],
                    'uploaded_by' => $userIds[UserSeeder::usernameFor($attachment['uploaded_by'])] ?? null,
                ]);
            }
        }
    }
}
