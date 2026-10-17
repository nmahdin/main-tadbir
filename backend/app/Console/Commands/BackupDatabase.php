<?php

namespace App\Console\Commands;

use App\Support\Storage\DatabaseBackup;
use App\Support\Storage\StoragePaths;
use Illuminate\Console\Command;

/**
 * پشتیبان دستی دیتابیس: `php artisan tadbir:backup`
 *
 * روی هاست بدون SSH همین کار از مسیر maintenance انجام می‌شود
 * (docs/storage-and-backup.md).
 */
class BackupDatabase extends Command
{
    protected $signature = 'tadbir:backup {--keep= : تعداد نسخهٔ نگه‌داشته‌شده} {--label= : برچسب کوتاه مثل before-update} {--with-files : آرشیو tar.gz از پوشهٔ فایل‌ها} {--list : فقط فهرست پشتیبان‌های موجود}';

    protected $description = 'تهیهٔ پشتیبان قابل بازیابی از دیتابیس (و در صورت درخواست از فایل‌ها)';

    public function handle(DatabaseBackup $backup): int
    {
        if ($this->option('list')) {
            $items = $backup->list();
            if ($items === []) {
                $this->line('هیچ پشتیبانی پیدا نشد. مسیر: '.StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db');

                return self::SUCCESS;
            }
            foreach ($items as $item) {
                $this->line(sprintf(
                    '%s | %s | %s ردیف | %s جدول | %s',
                    $item['file'],
                    $item['created_at'] ?? '—',
                    number_format((int) ($item['rows'] ?? 0)),
                    number_format((int) ($item['tables'] ?? 0)),
                    $item['verified'] === true ? 'هش تأیید شد' : ($item['verified'] === false ? 'هش نامطابق!' : 'بدون manifest'),
                ));
            }

            return self::SUCCESS;
        }

        if ($this->option('keep') !== null) {
            config(['tadbir.backup_keep' => max(1, (int) $this->option('keep'))]);
        }

        $this->line('ریشهٔ فایل‌ها: '.StoragePaths::filesRoot());
        $this->line('پوشهٔ پشتیبان: '.StoragePaths::backupRoot());

        $result = $backup->create([
            'label' => (string) ($this->option('label') ?? ''),
            'include_files' => (bool) $this->option('with-files'),
        ]);

        $this->info(sprintf(
            'پشتیبان ساخته شد: %s (%s، %d جدول، %s ردیف)',
            $result['file'],
            $this->human((int) $result['bytes']),
            $result['tables'],
            number_format((int) $result['rows']),
        ));
        $this->line('مسیر: '.$result['path']);
        $this->line('هش SHA-256: '.$result['sha256']);

        foreach ($result['warnings'] as $warning) {
            $this->warn($warning);
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
