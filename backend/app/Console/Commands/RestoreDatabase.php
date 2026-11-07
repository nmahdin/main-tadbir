<?php

namespace App\Console\Commands;

use App\Support\Storage\DatabaseBackup;
use App\Support\Storage\StoragePaths;
use Illuminate\Console\Command;
use Throwable;

/**
 * بازگردانی پشتیبان دیتابیس: `php artisan tadbir:restore db-....sql.gz --confirm=db-....sql.gz`
 *
 * بدون تأیید صریح هیچ نوشتنی روی دیتابیس انجام نمی‌شود؛ پیش از بازگردانی هم از
 * وضعیت فعلی به‌طور خودکار پشتیبان `pre-restore` گرفته می‌شود.
 */
class RestoreDatabase extends Command
{
    protected $signature = 'tadbir:restore {file? : نام فایل پشتیبان} {--confirm= : همان نام فایل، برای تأیید صریح} {--list : فهرست پشتیبان‌های موجود}';

    protected $description = 'بازگردانی دیتابیس از یک پشتیبان (با پشتیبان ایمنی خودکار پیش از بازگردانی)';

    public function handle(DatabaseBackup $backup): int
    {
        if ($this->option('list') || ! $this->argument('file')) {
            $items = $backup->list();
            if ($items === []) {
                $this->line('پشتیبانی موجود نیست. مسیر: '.StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db');

                return self::SUCCESS;
            }
            foreach ($items as $item) {
                $this->line(sprintf(
                    '%s | %s | %s ردیف | %s',
                    $item['file'],
                    $item['created_at'] ?? '—',
                    number_format((int) ($item['rows'] ?? 0)),
                    $item['verified'] === false ? 'هش نامطابق!' : 'قابل بازگردانی',
                ));
            }
            if (! $this->argument('file')) {
                $this->line('برای بازگردانی: php artisan tadbir:restore <file> --confirm=<file>');
            }

            return self::SUCCESS;
        }

        $file = (string) $this->argument('file');
        $confirmed = (string) $this->option('confirm') === basename($file);

        if (! $confirmed) {
            $this->error('تأیید لازم است. دستور را با --confirm='.basename($file).' تکرار کنید.');

            return self::FAILURE;
        }

        try {
            $result = $backup->restore($file, true);
        } catch (Throwable $exception) {
            $this->error('بازگردانی انجام نشد: '.$exception->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf('بازگردانی کامل شد: %d دستور SQL روی %d جدول.', $result['statements'], $result['tables']));
        $this->line('پشتیبان ایمنی وضعیت قبلی: '.$result['safety']);
        $this->warn('cache مسیرها/تنظیمات و OPcache را پاک کنید و یک بار ورود/فهرست محتوا را بررسی کنید.');

        return self::SUCCESS;
    }
}
