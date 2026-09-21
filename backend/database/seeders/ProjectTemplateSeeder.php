<?php

namespace Database\Seeders;

use App\Models\ProjectTemplate;
use Illuminate\Database\Seeder;

/**
 * الگوهای آماده پروژه (INITIAL_TEMPLATES در فرانت‌اند).
 *
 * هر الگو شامل مراحل (stages) و فهرست وظایف پیشنهادی (tasks) است که هنگام ساخت
 * پروژه از روی الگو، مهلت هر وظیفه به صورت نسبی از تاریخ شروع پروژه محاسبه می‌شود.
 */
class ProjectTemplateSeeder extends Seeder
{
    /**
     * @var array<int, array<string, mixed>>
     */
    public const TEMPLATES = [
        [
            'name' => 'اسپرینت توسعه چابک نرم‌افزار (Scrum Software Sprint)',
            'description' => 'الگوی استاندارد تیم‌های فنی شامل مراحل تحلیل نیازمندی‌ها، طراحی معماری، پیاده‌سازی بک‌اند و فرانت‌اند، تست‌های خودکار و تحویل نسخه.',
            'category' => 'مهندسی نرم‌افزار',
            'icon' => 'Layers',
            'color' => '#6366f1',
            'default_priority' => 'high',
            'estimated_duration_days' => 14,
            'budget' => '۱۵۰,۰۰۰,۰۰۰ تومان',
            'tags' => ['اسکرام', 'اسپرینت', 'نرم‌افزار', 'چابک'],
            'stages' => [
                ['id' => 'backlog', 'name' => 'بک‌لاگ اسپرینت', 'color' => '#94a3b8'],
                ['id' => 'todo', 'name' => 'برای انجام', 'color' => '#64748b'],
                ['id' => 'in_progress', 'name' => 'در حال توسعه', 'color' => '#3b82f6'],
                ['id' => 'review', 'name' => 'بررسی کد و معماری', 'color' => '#8b5cf6'],
                ['id' => 'completed', 'name' => 'تست شده و مستقر', 'color' => '#10b981'],
            ],
            'tasks' => [
                ['title' => 'برگزاری جلسه برنامه‌ریزی اسپرینت و اولویت‌بندی نیازمندی‌ها', 'description' => 'بررسی استوری‌های کاربر، تخمین ساعت و تخصیص وظایف به اعضای تیم توسعه.', 'relative_due_days' => 2, 'estimated_hours' => 8, 'priority' => 'high', 'status' => 'todo', 'tags' => ['اسپرینت', 'برنامه‌ریزی'], 'suggested_role' => 'project_manager'],
                ['title' => 'طراحی معماری پایگاه داده و تعریف قراردادهای API', 'description' => 'ایجاد اسکیماهای پایگاه داده و تنظیم مستندات Swagger برای هماهنگی فرانت‌اند و بک‌اند.', 'relative_due_days' => 5, 'estimated_hours' => 16, 'priority' => 'urgent', 'status' => 'todo', 'tags' => ['بک‌اند', 'API', 'دیتابیس'], 'suggested_role' => 'team_member'],
                ['title' => 'پیاده‌سازی کامپوننت‌های رابط کاربری و اتصال به سرویس‌ها', 'description' => 'ساخت صفحات اصلی، مدیریت وضعیت و اتصال به APIهای تحویل‌شده.', 'relative_due_days' => 9, 'estimated_hours' => 24, 'priority' => 'high', 'status' => 'todo', 'tags' => ['فرانت‌اند', 'React', 'UI'], 'suggested_role' => 'team_member'],
                ['title' => 'اجرای تست‌های جامع E2E و تضمین کیفیت نهایی', 'description' => 'نوشتن سناریوهای Playwright، اجرای رگرسیون و ثبت ایرادهای بحرانی.', 'relative_due_days' => 12, 'estimated_hours' => 12, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['QA', 'تست', 'CI/CD'], 'suggested_role' => 'team_member'],
                ['title' => 'برگزاری جلسه دمو و رترواسپکتیو اسپرینت', 'description' => 'ارائه دستاورد اسپرینت، جمع‌بندی موانع و تعیین اقدامات بهبود.', 'relative_due_days' => 14, 'estimated_hours' => 4, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['دمو', 'رترو'], 'suggested_role' => 'project_manager'],
            ],
        ],
        [
            'name' => 'کمپین لانچ و عرضه محصول به بازار (Go-To-Market & Product Launch)',
            'description' => 'چارچوب جامع برای معرفی محصول جدید به بازار، کمپین‌های تبلیغاتی، هماهنگی رسانه‌ای، آموزش تیم فروش و پشتیبانی مشتریان.',
            'category' => 'بازاریابی و رشد',
            'icon' => 'Sparkles',
            'color' => '#ec4899',
            'default_priority' => 'urgent',
            'estimated_duration_days' => 21,
            'budget' => '۲۰۰,۰۰۰,۰۰۰ تومان',
            'tags' => ['لانچ', 'مارکتینگ', 'محصول', 'کمپین'],
            'stages' => [
                ['id' => 'backlog', 'name' => 'ایده‌پردازی و استراتژی', 'color' => '#94a3b8'],
                ['id' => 'todo', 'name' => 'آماده‌سازی محتوا و لندینگ', 'color' => '#f59e0b'],
                ['id' => 'in_progress', 'name' => 'اجرای پیش‌کمپین', 'color' => '#ec4899'],
                ['id' => 'review', 'name' => 'روز رونمایی (Launch Day)', 'color' => '#8b5cf6'],
                ['id' => 'completed', 'name' => 'تحلیل نتایج و بازخوردها', 'color' => '#10b981'],
            ],
            'tasks' => [
                ['title' => 'تدوین سند جایگاه‌یابی محصول و پیام‌رسانی اصلی (Value Prop)', 'description' => 'مشخص کردن پرسوناها، مزیت رقابتی و پیام کلیدی در تمام کانال‌ها.', 'relative_due_days' => 4, 'estimated_hours' => 12, 'priority' => 'urgent', 'status' => 'todo', 'tags' => ['استراتژی', 'پرسونا'], 'suggested_role' => 'admin'],
                ['title' => 'طراحی و توسعه لندینگ پیج اختصاصی رونمایی با فرم ثبت‌نام زودهنگام', 'description' => 'ساخت صفحه فرود واکنش‌گرا همراه با فرم جذب سرنخ و اتصال به ابزار تحلیل.', 'relative_due_days' => 10, 'estimated_hours' => 20, 'priority' => 'high', 'status' => 'todo', 'tags' => ['لندینگ', 'طراحی', 'فرانت‌اند'], 'suggested_role' => 'team_member'],
                ['title' => 'تولید بسته مطبوعاتی، پست‌های شبکه‌های اجتماعی و تیزر ویدیویی', 'description' => 'آماده‌سازی محتوای چندرسانه‌ای هماهنگ با تقویم انتشار کمپین.', 'relative_due_days' => 15, 'estimated_hours' => 18, 'priority' => 'high', 'status' => 'todo', 'tags' => ['محتوا', 'رسانه', 'ویدیو'], 'suggested_role' => 'team_member'],
                ['title' => 'آموزش تیم فروش و استقرار سیستم پشتیبانی آنلاین', 'description' => 'برگزاری کارگاه آموزشی و راه‌اندازی کانال‌های پاسخ‌گویی به مشتریان.', 'relative_due_days' => 18, 'estimated_hours' => 10, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['فروش', 'پشتیبانی', 'آموزش'], 'suggested_role' => 'project_manager'],
                ['title' => 'راه‌اندازی کمپین تبلیغاتی کلیکی و پایش نرخ تبدیل روزانه', 'description' => 'تنظیم کمپین‌های تبلیغاتی، تعیین بودجه و پایش شاخص‌های تبدیل.', 'relative_due_days' => 21, 'estimated_hours' => 15, 'priority' => 'high', 'status' => 'todo', 'tags' => ['تبلیغات', 'آنالیتیکس', 'رشد'], 'suggested_role' => 'project_manager'],
            ],
        ],
        [
            'name' => 'توسعه سیستم دیزاین و استانداردهای UI/UX (Design System Sprint)',
            'description' => 'طراحی یکپارچه کامپوننت‌های پایه، تایپوگرافی، پالت‌های رنگی، حالت‌های تعاملی و پیاده‌سازی کتابخانه کامپوننت در کد.',
            'category' => 'طراحی محصول',
            'icon' => 'FolderKanban',
            'color' => '#0ea5e9',
            'default_priority' => 'medium',
            'estimated_duration_days' => 18,
            'budget' => '۱۲۰,۰۰۰,۰۰۰ تومان',
            'tags' => ['دیزاین سیستم', 'UI/UX', 'Figma', 'کامپوننت'],
            'stages' => [
                ['id' => 'backlog', 'name' => 'ممیزی و پژوهش', 'color' => '#94a3b8'],
                ['id' => 'todo', 'name' => 'طراحی توکن‌های پایه', 'color' => '#0ea5e9'],
                ['id' => 'in_progress', 'name' => 'ساخت کامپوننت‌ها', 'color' => '#6366f1'],
                ['id' => 'review', 'name' => 'مستندسازی و استوری‌بوک', 'color' => '#8b5cf6'],
                ['id' => 'completed', 'name' => 'انتشار بسته NPM', 'color' => '#10b981'],
            ],
            'tasks' => [
                ['title' => 'ممیزی بصری رابط کاربری موجود و دسته‌بندی الگوهای تکراری', 'description' => 'شناسایی ناهماهنگی‌های رنگ، فاصله و تایپوگرافی در صفحات فعلی.', 'relative_due_days' => 3, 'estimated_hours' => 10, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['ممیزی', 'UI'], 'suggested_role' => 'team_member'],
                ['title' => 'تعریف توکن‌های طراحی (رنگ، سایه، گوشه‌ها، تایپوگرافی)', 'description' => 'خروجی گرفتن توکن‌ها به صورت متغیرهای CSS و تنظیمات Tailwind.', 'relative_due_days' => 7, 'estimated_hours' => 16, 'priority' => 'high', 'status' => 'todo', 'tags' => ['توکن', 'Figma', 'Tailwind'], 'suggested_role' => 'team_member'],
                ['title' => 'کدنویسی کامپوننت‌های پایه (دکمه، اینپوت، مودال، کارت، بج)', 'description' => 'پیاده‌سازی کامپوننت‌های پایه با پشتیبانی کامل از راست‌به‌چپ و حالت‌های تعاملی.', 'relative_due_days' => 14, 'estimated_hours' => 28, 'priority' => 'urgent', 'status' => 'todo', 'tags' => ['React', 'TypeScript', 'RTL'], 'suggested_role' => 'team_member'],
                ['title' => 'راه‌اندازی محیط نمایش تعاملی و مستندات آنلاین', 'description' => 'ساخت Storybook و نوشتن راهنمای استفاده برای تیم‌های توسعه.', 'relative_due_days' => 18, 'estimated_hours' => 12, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['مستندات', 'Storybook'], 'suggested_role' => 'project_manager'],
            ],
        ],
        [
            'name' => 'ممیزی امنیت و تست نفوذ دوره‌ای (Security Audit & Hardening)',
            'description' => 'ارزیابی آسیب‌پذیری‌های وب و سرور، تست نفوذ لایه اپلیکیشن، بررسی کنترل دسترسی‌ها، امن‌سازی پایگاه داده و تدوین گزارش انطباق.',
            'category' => 'امنیت و انطباق',
            'icon' => 'CheckSquare',
            'color' => '#ef4444',
            'default_priority' => 'urgent',
            'estimated_duration_days' => 10,
            'budget' => '۱۱۰,۰۰۰,۰۰۰ تومان',
            'tags' => ['امنیت', 'تست نفوذ', 'ممیزی', 'OWASP'],
            'stages' => [
                ['id' => 'backlog', 'name' => 'ارزیابی اولیه دارایی‌ها', 'color' => '#94a3b8'],
                ['id' => 'todo', 'name' => 'اسکن خودکار آسیب‌پذیری', 'color' => '#f59e0b'],
                ['id' => 'in_progress', 'name' => 'تست نفوذ دستی', 'color' => '#ef4444'],
                ['id' => 'review', 'name' => 'اصلاح و اعمال پچ‌های امنیتی', 'color' => '#8b5cf6'],
                ['id' => 'completed', 'name' => 'صدور گواهی و گزارش نهایی', 'color' => '#10b981'],
            ],
            'tasks' => [
                ['title' => 'اسکن آسیب‌پذیری وابستگی‌های نرم‌افزاری (SCA & SAST)', 'description' => 'اجرای ابزارهای تحلیل ترکیب نرم‌افزار و کد ایستا روی مخازن پروژه.', 'relative_due_days' => 2, 'estimated_hours' => 8, 'priority' => 'high', 'status' => 'todo', 'tags' => ['اسکن', 'کد'], 'suggested_role' => 'team_member'],
                ['title' => 'تست نفوذ وب‌سرویس‌ها طبق چک‌لیست OWASP Top 10', 'description' => 'آزمون دستی نقاط پایانی API، احراز هویت، مدیریت نشست و اعتبارسنجی ورودی‌ها.', 'relative_due_days' => 6, 'estimated_hours' => 20, 'priority' => 'urgent', 'status' => 'todo', 'tags' => ['OWASP', 'API', 'تست نفوذ'], 'suggested_role' => 'team_member'],
                ['title' => 'بررسی و امن‌سازی سطوح دسترسی کاربران و رول‌های سیستمی', 'description' => 'بازبینی ماتریس دسترسی، اصل حداقل دسترسی و ثبت رویدادهای حساس.', 'relative_due_days' => 8, 'estimated_hours' => 10, 'priority' => 'high', 'status' => 'todo', 'tags' => ['RBAC', 'مجوزها'], 'suggested_role' => 'admin'],
                ['title' => 'تدوین گزارش رسمی ممیزی امنیت و نقشه راه برطرف‌سازی موارد باقی‌مانده', 'description' => 'دسته‌بندی یافته‌ها بر اساس شدت و تعیین زمان‌بندی رفع هر مورد.', 'relative_due_days' => 10, 'estimated_hours' => 8, 'priority' => 'medium', 'status' => 'todo', 'tags' => ['گزارش', 'مدیریت'], 'suggested_role' => 'project_manager'],
            ],
        ],
    ];

    public function run(): void
    {
        foreach (self::TEMPLATES as $definition) {
            ProjectTemplate::updateOrCreate(
                ['name' => $definition['name']],
                [
                    'description' => $definition['description'],
                    'category' => $definition['category'],
                    'icon' => $definition['icon'],
                    'color' => $definition['color'],
                    'default_priority' => $definition['default_priority'],
                    'estimated_duration_days' => $definition['estimated_duration_days'],
                    'budget' => $definition['budget'],
                    'stages' => $definition['stages'],
                    'tasks' => $definition['tasks'],
                    'tags' => $definition['tags'],
                    'is_built_in' => true,
                ],
            );
        }
    }
}
