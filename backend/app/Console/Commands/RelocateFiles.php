<?php

namespace App\Console\Commands;

use App\Support\Storage\StoragePaths;
use App\Support\Storage\StorageRelocator;
use Illuminate\Console\Command;

/**
 * انتقال فایل‌های آپلودشده به ریشهٔ جدید.
 *
 *   php artisan tadbir:files-relocate                # فقط گزارش (dry-run)
 *   php artisan tadbir:files-relocate --apply         # انتقال واقعی
 *   php artisan tadbir:files-relocate --apply --prune-source
 *
 * پیش‌شرط: در `.env` مقدار TADBIR_FILES_ROOT به پوشهٔ جدید بیرون از نرم‌افزار
 * تنظیم شده باشد و برای دسترسی فایل‌های قبلی، مقدار قبلی در
 * TADBIR_FILES_LEGACY_ROOT نگه داشته شود.
 */
class RelocateFiles extends Command
{
    protected $signature = 'tadbir:files-relocate {--limit=500 : حداکثر تعداد فایل در هر اجرا} {--apply : انتقال واقعی، نه فقط گزارش} {--copy : کپی به‌جای جابه‌جایی} {--prune-source : پس از کپی موفق، فایل مبدأ پاک شود}';

    protected $description = 'انتقال فایل‌های آپلودشدهٔ موجود به ریشهٔ بیرون از نرم‌افزار (TADBIR_FILES_ROOT)';

    public function handle(StorageRelocator $relocator): int
    {
        $status = $relocator->status();

        $this->line('ریشهٔ جدید (TADBIR_FILES_ROOT): '.$status['to']);
        $this->line('ریشهٔ قبلی (TADBIR_FILES_LEGACY_ROOT): '.$status['from']);
        $this->line(sprintf('مبدأ: %s ردیف / %s | مقصد: %s ردیف / %s',
            number_format($status['source']['files']),
            $this->human((int) $status['source']['bytes']),
            number_format($status['target']['files']),
            $this->human((int) $status['target']['bytes']),
        ));

        if ($status['same_path']) {
            $this->error('دو ریشه یکی است. ابتدا TADBIR_FILES_ROOT را در .env تنظیم کنید.');

            return self::FAILURE;
        }
        if (! $status['files_root_external']) {
            $this->warn('ریشهٔ جدید هنوز داخل پوشهٔ نرم‌افزار است؛ با آپدیت بعدی می‌تواند از دست برود.');
        }

        $result = $relocator->run(
            (int) $this->option('limit'),
            (bool) $this->option('apply'),
            ! $this->option('copy'),
            (bool) $this->option('prune-source'),
        );

        $this->info(sprintf('%s: %d پردازش، %d جابه‌جا، %d کپی، %d از قبل موجود، %d خطا، %d باقی‌مانده',
            $result['applied'] ? 'اجرا شد' : 'گزارش (بدون تغییر)',
            $result['processed'],
            $result['moved'],
            $result['copied'],
            $result['skipped'],
            $result['failed'],
            $result['pending'],
        ));

        foreach ($result['errors'] as $error) {
            $this->warn($error);
        }
        if (! $result['applied'] && ($result['processed'] > 0 || $result['pending'] > 0)) {
            $this->line('برای انتقال واقعی همین دستور را با --apply اجرا کنید.');
        }
        if ($result['pending'] > 0) {
            $this->line('بقیهٔ فایل‌ها با اجرای بعدی همین دستور منتقل می‌شوند (تکرارپذیر است).');
        }

        return self::SUCCESS;
    }

    private function human(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $index = 0;
        $value = (float) $bytes;
        while ($value >= 1024 && $index < count($units) - 1) {
            $value /= 1024;
            $index++;
        }

        return number_format($value, $index === 0 ? 0 : 2).' '.$units[$index];
    }
}
