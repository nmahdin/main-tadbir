<?php

use App\Support\Schema\WorkspaceIndexes;
use Illuminate\Database\Migrations\Migration;

/**
 * ایندکس‌های گزارش‌ها و فهرست‌های کاری.
 *
 * تا پیش از این هیچ ایندکس ثانویه‌ای روی «وضعیت»، «نوع» و «سررسید» نبود و هر
 * بارگذاری فهرست یا گزارش، جدول کامل را می‌خواند (گزارش‌ها ۹ تجمیع و چند
 * شمارش روی همین جدول‌ها اجرا می‌کنند).
 *
 * **این مایگریشن اختیاری است و هیچ داده یا جدولی نمی‌سازد.** اگر هاست شما CLI
 * ندارد یا اجازهٔ ALTER نمی‌دهد، سامانه بدون آن هم کامل کار می‌کند و می‌توانید
 * همین ایندکس‌ها را از دو مسیر دیگر بسازید:
 *   - تنظیمات ← نگهداری ← «ایندکس‌های عملکرد» ← «ساخت ایندکس‌های ناقص»
 *   - اجرای دستی `docs/deployment/workspace-indexes.mysql.sql` در phpMyAdmin
 *
 * هر سه مسیر از یک منبع حقیقت (`App\Support\Schema\WorkspaceIndexes`) می‌خوانند
 * و idempotent هستند؛ اگر ایندکس‌ها قبلاً ساخته شده باشند، این مایگریشن کاری
 * نمی‌کند و موفق ثبت می‌شود.
 */
return new class extends Migration
{
    public function up(): void
    {
        $result = (new WorkspaceIndexes())->ensure();

        if ($result['failed'] !== []) {
            // خطای واقعی ALTER باید دیده شود؛ ثبت مایگریشن بدون ساخت ایندکس،
            // وضعیت را مبهم می‌کند. پیام عیناً همان خطای پایگاه‌داده است.
            throw new RuntimeException(
                'ساخت ایندکس‌های عملکرد انجام نشد: '.implode(' | ', $result['failed'])
                .' — می‌توانید همین ایندکس‌ها را از تنظیمات ← نگهداری یا فایل SQL دستی بسازید.',
            );
        }
    }

    public function down(): void
    {
        (new WorkspaceIndexes())->drop();
    }
};
