# سامانه تدبیر — Backend (Laravel API)

## راه‌اندازی سریع

```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed      # ایجاد جداول + داده‌های پایه (نقش‌ها، دسترسی‌ها، دپارتمان‌ها و...)
php artisan serve               # پیش‌فرض: http://127.0.0.1:8000
```

> پس از هر `git pull` که مایگریشن جدید داشت، `php artisan migrate` را اجرا کنید.

## ماژول‌های API نسخه ۱ (`/api/v1`)

| ماژول | مسیرها |
|---|---|
| احراز هویت | `auth/login`, `auth/register`, `auth/me`, `auth/logout`, `auth/forgot-password`, `auth/reset-password` |
| پروژه‌ها / تسک‌ها / کاربران / محتوا | `projects`, `tasks`, `users`, `contents` |
| رکوردهای فضای کار | `ideas`, `think-tank-meetings`, `secretariat-letters`, `secretariat-resolutions`, `archive-dossiers` |
| نقش‌ها / دپارتمان‌ها / تیم‌ها | `roles`, `departments`, `teams` |
| الگوهای پروژه | `project-templates` |
| اعلان‌ها | `notifications` |
| مدیریت دارایی دیجیتال (DAM) | `dam/library`، پوشه‌ها، دسته‌بندی‌ها، نسخه‌ها و فعالیت‌ها (مستندات زیر) |
| چت داخلی | `chat/conversations`, `chat/messages` |
| گزارش فعالیت | `activity-logs` |
| تنظیمات سیستمی | `settings`, `settings/{key}` |

### تنظیمات سیستمی پویا (`/api/v1/settings`)

هر کلید تنظیمات یک آرایه یا شیء کامل JSON است و از `GET` (همه کاربران احراز هویت‌شده) و `PUT` (مدیر سیستم یا دارندهٔ `settings.manage`؛ مجوزهای `content.manage_process` / `workflows.manage` فقط برای کلیدهای `process_templates` و `workflows`) پشتیبانی می‌کند:

| کلید | ساختار | توضیح |
|---|---|---|
| `content_types` | لیست | انواع محتوای رسانه‌ای |
| `categories` | لیست | دسته‌بندی‌های پروژه/تسک/اتاق فکر |
| `process_templates` | لیست | الگوهای فرایند تولید محتوا |
| `publishing_platforms` | لیست | کانال‌ها و پلتفرم‌های انتشار |
| `workflows` | لیست | گردش‌کارهای تولید |
| `general` | شیء | هویت سازمان (`orgName`, `workspaceSlug`)، طول اسپرینت (`sprintLength`)، منطقه زمانی (`timezone`) و تقویم (`calendar`) |
| `notifications` | شیء | سیاست اعلان‌ها (`emailAlerts`, `deadlineReminders`, `mentionAlerts`, `weeklyDigest`) |
| `security` | شیء | `twoFactorEnforced`, `passwordMinLength`, `sessionLifetimeMinutes`, `maxLoginAttempts` |
| `task_priorities` | لیست | اولویت‌های وظایف با برچسب و رنگ سفارشی (`{id, label, color, order}`) |

کلیدهای شیءای (`general`/`notifications`/`security`) هنگام ذخیره با مقادیر پیش‌فرض ساختاری merge می‌شوند تا همیشه کامل باشند.

### ماتریس دسترسی — نکات پیاده‌سازی

- همه مسیرهای نوشتن `projects`, `contents`, `tasks`, `users`, `roles`, `departments`, `teams`, `settings` با میان‌افزار `permission:*` محافظت می‌شوند؛ رکوردهای فضای کار (ایده/جلسه/نامه/مصوبه/زونکن) دسترسی‌شان داخل `WorkspaceRecordController` بررسی می‌شود.
- رکوردهای فضای کار از «تشخیص اکشن بر پایه diff» پشتیبانی می‌کنند: اگر تغییرات ارسالی فقط فیلدهای یک اکشن خاص را لمس کند، داشتن دسترسی اختصاصی همان اکشن کافی است — رأی‌دهی ایده (`thinktank.vote`)، تأیید/تبدیل ایده (`thinktank.approve_convert`)، ارجاع نامه (`secretariat.refer_letter`) و بایگانی نامه (`secretariat.archive_letter`). تغییرات سایر فیلدها مستلزم دسترسی `edit` همان ماژول است.
- حذف نامه‌ها مستلزم `secretariat.delete_letter` است (جدای از ویرایش).
- تغییر مجوزهای نقش‌ها (ایجاد نقشِ دارای مجوز یا sync مجوزها) مستلزم `roles.manage_permissions` است؛ `roles.edit` به‌تنهایی نمی‌تواند ماتریس دسترسی را تغییر دهد و کلید نقش‌های سیستمی تغییر نمی‌کند.
- تغییر وضعیت حساب کاربر (فعال/غیرفعال/مسدود) مستلزم `users.status` است و هیچ کاربری (غیر مدیر) نمی‌تواند نقش خودش را تغییر دهد. حذف مدیر سیستم فقط توسط مدیر دیگر و در صورت باقی‌ماندن حداقل یک مدیر فعال ممکن است.
- حذف پیام‌ها/گفتگوهای چت فقط توسط سازنده یا دارندگان `messaging.delete_message` / `messaging.manage_group` مجاز است.

### API مخزن مرکزی DAM

تمام مسیرهای زیر زیر `/api/v1` و پشت `auth:sanctum` هستند. مجوزها در بک‌اند با کلیدهای فعلی `assets.view`, `assets.upload`, `assets.edit_info`, `assets.download`, `assets.preview`, `assets.move`, `assets.create_version`, `assets.restore`, `assets.delete` و `assets.manage_access` بررسی می‌شوند.

| روش | مسیر | هدف |
|---|---|---|
| `GET` / `POST` | `/dam/library` | فهرست صفحه‌بندی‌شده و ایجاد فایل (`multipart/form-data`) یا محتوای متنی (`body`) |
| `GET` | `/dam/library/summary` | شمارش فایل/محتوا و فضای استفاده‌شدهٔ قابل‌مشاهده |
| `GET` | `/dam/library/activities` | تاریخچهٔ فعالیت‌های دارایی‌های قابل‌مشاهده |
| `GET` / `PATCH` | `/dam/library/{id}` | جزئیات یا ویرایش metadata/برچسب‌ها/دسته‌بندی/پوشه |
| `DELETE` | `/dam/library/{id}` | بایگانی نرم دارایی |
| `POST` | `/dam/library/{id}/restore` | بازیابی دارایی بایگانی‌شده |
| `POST` | `/dam/library/{id}/relations` | اتصال همان دارایی به project/task/department، بدون کپی فایل |
| `GET` | `/dam/library/{id}/download`، `/dam/library/{id}/preview` | دریافت امن فایل یا پیش‌نمایش قالب‌های مجاز |
| `POST` | `/dam/library/{id}/versions` | جایگزینی فایل یا ثبت نسخهٔ جدید متن |
| `POST` | `/dam/library/{id}/versions/{version}/restore` | بازیابی نسخه به‌صورت یک نسخهٔ جدید |
| `POST` | `/dam/library/bulk/move`، `/dam/library/bulk/archive` | انتقال/بایگانی گروهی تا ۱۰۰ دارایی |
| `GET` / `POST` | `/dam/library/folders`، `/dam/library/categories` | مرور/ایجاد پوشه و دسته‌بندی؛ `PATCH /dam/library/folders/{id}` برای تغییر نام/والد پوشه |

پارامترهای فهرست شامل `type`, `search`, `project_id`, `task_id`, `department_id`, `folder_id`, `category_id`, `owner_id`, `status`, `confidentiality`, `sort`, `direction`, `per_page` هستند. `folder_id=0` فقط دارایی‌های ریشه/بدون پوشه را برمی‌گرداند. برای ثبت فایل، `title`، `file` و metadata به‌صورت multipart ارسال شود؛ برای محتوا، `title` و `body` ارسال شود. سقف فعلی آپلود ۲۰ مگابایت است.

فایل‌ها روی disk خصوصی `local` قرار می‌گیرند؛ `storage_path`، `storage_disk` و نام فیزیکی در پاسخ API افشا نمی‌شوند. پیش‌نمایش SVG/HTML غیرفعال است. برای اطلاعات معماری، سازگاری داده‌های legacy و محدودیت‌های نسخهٔ اول به `docs/dam-architecture.md` مراجعه کنید.

<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
