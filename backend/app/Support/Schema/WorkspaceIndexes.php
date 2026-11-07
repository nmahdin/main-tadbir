<?php

namespace App\Support\Schema;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * ایندکس‌های عملکردیِ جدول‌های کاری — یک منبع حقیقت برای هر سه مسیر ساخت.
 *
 * سه راه برای ساختن این ایندکس‌ها وجود دارد و هر سه از همین کلاس می‌خوانند:
 *   ۱) `php artisan migrate` (فایل migration فقط همین کلاس را صدا می‌زند)،
 *   ۲) دکمهٔ «ساخت ایندکس‌های ناقص» در تنظیمات ← نگهداری (هاست بدون SSH)،
 *   ۳) فایل SQL دستی `docs/deployment/workspace-indexes.mysql.sql` (phpMyAdmin).
 *
 * نکتهٔ مهم: این ایندکس‌ها فقط سرعت خواندن را بهتر می‌کنند و **هیچ‌کدام برای
 * کارکرد سامانه لازم نیستند**. اگر هاست اجازهٔ ساختشان را ندهد، سامانه کامل کار
 * می‌کند؛ فقط فهرست‌ها و گزارش‌ها روی دادهٔ بزرگ کندتر می‌شوند.
 *
 * ساخت idempotent است: هر ایندکسی که از قبل باشد رد می‌شود، پس اجرای دوباره،
 * از مسیر migrate یا از پنل، هیچ خطایی نمی‌دهد و هیچ داده‌ای را تغییر نمی‌دهد.
 */
final class WorkspaceIndexes
{
    /**
     * جدول ← [نام ایندکس ← ستون‌ها].
     *
     * نام‌ها عیناً همان نام‌هایی هستند که migrationهای قبلی/بعدی و فایل SQL
     * دستی استفاده می‌کنند؛ تغییر نام یعنی از دست رفتن تشخیص «از قبل ساخته شده».
     *
     * @var array<string, array<string, list<string>>>
     */
    public const DEFINITIONS = [
        'contents' => [
            'contents_status_deadline_index' => ['status', 'deadline'],
            'contents_type_status_index' => ['type', 'status'],
            'contents_deadline_index' => ['deadline'],
        ],
        'tasks' => [
            'tasks_status_deadline_index' => ['status', 'deadline'],
            'tasks_assignee_status_index' => ['assignee_id', 'status'],
            'tasks_project_status_index' => ['project_id', 'status'],
            'tasks_deadline_index' => ['deadline'],
        ],
        'workspace_records' => [
            'workspace_records_kind_status_index' => ['kind', 'status'],
        ],
    ];

    /**
     * وضعیت هر ایندکس: ساخته‌شده یا نه.
     *
     * @return array{
     *     total: int,
     *     present: int,
     *     missing: int,
     *     tables: list<array{table: string, exists: bool, indexes: list<array{name: string, columns: list<string>, exists: bool}>}>
     * }
     */
    public function status(): array
    {
        $tables = [];
        $total = 0;
        $present = 0;

        foreach (self::DEFINITIONS as $table => $indexes) {
            $tableExists = Schema::hasTable($table);
            $existing = $tableExists ? $this->indexNames($table) : [];

            $rows = [];
            foreach ($indexes as $name => $columns) {
                $total++;
                $exists = in_array($name, $existing, true);
                $present += $exists ? 1 : 0;
                $rows[] = ['name' => $name, 'columns' => $columns, 'exists' => $exists];
            }

            $tables[] = ['table' => $table, 'exists' => $tableExists, 'indexes' => $rows];
        }

        return [
            'total' => $total,
            'present' => $present,
            'missing' => $total - $present,
            'tables' => $tables,
        ];
    }

    /**
     * ساخت ایندکس‌های ناقص.
     *
     * @return array{created: list<string>, skipped: list<string>, failed: array<string, string>, missing_tables: list<string>}
     */
    public function ensure(): array
    {
        $result = ['created' => [], 'skipped' => [], 'failed' => [], 'missing_tables' => []];

        foreach (self::DEFINITIONS as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                $result['missing_tables'][] = $table;

                continue;
            }

            $existing = $this->indexNames($table);

            foreach ($indexes as $name => $columns) {
                if (in_array($name, $existing, true)) {
                    $result['skipped'][] = $name;

                    continue;
                }

                try {
                    // MySQL/MariaDB این را به `ALTER TABLE … ADD INDEX` ترجمه
                    // می‌کنند که در MySQL 8 بدون قفل کامل جدول اجرا می‌شود.
                    Schema::table($table, function (Blueprint $blueprint) use ($columns, $name): void {
                        $blueprint->index($columns, $name);
                    });
                    $result['created'][] = $name;
                } catch (Throwable $error) {
                    // پیام خطا فقط برای نمایش به مدیر است؛ داده یا ساختار دیگری
                    // لمس نمی‌شود و بقیهٔ ایندکس‌ها همچنان ساخته می‌شوند.
                    $result['failed'][$name] = $this->safeMessage($error);
                }
            }
        }

        return $result;
    }

    /** حذف همهٔ ایندکس‌های همین فهرست (برای rollback مایگریشن). */
    public function drop(): void
    {
        foreach (self::DEFINITIONS as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $existing = $this->indexNames($table);

            foreach (array_keys($indexes) as $name) {
                if (! in_array($name, $existing, true)) {
                    continue;
                }

                try {
                    Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($name));
                } catch (Throwable) {
                    // ایندکس ممکن است هم‌زمان حذف شده باشد؛ ادامهٔ بقیه بی‌خطر است.
                }
            }
        }
    }

    /**
     * نام ایندکس‌های موجود یک جدول.
     *
     * `Schema::getIndexes` در درایورهای پشتیبانی‌نشده خطا می‌دهد؛ در آن حالت
     * فهرست خالی برمی‌گردد و «ساخت» انجام می‌شود که خودش خطای «از قبل وجود دارد»
     * را در try/catch همان ایندکس می‌گیرد.
     *
     * @return list<string>
     */
    private function indexNames(string $table): array
    {
        try {
            return array_values(array_map(
                fn ($index) => (string) ($index['name'] ?? ''),
                Schema::getIndexes($table),
            ));
        } catch (Throwable) {
            return [];
        }
    }

    /** پیام خطای کوتاه و بدون مسیر/رمز برای نمایش در پنل. */
    private function safeMessage(Throwable $error): string
    {
        $message = trim($error->getMessage());

        return mb_substr($message === '' ? 'خطای نامشخص پایگاه‌داده' : $message, 0, 300);
    }
}
