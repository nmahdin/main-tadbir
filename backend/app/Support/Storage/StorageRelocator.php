<?php

namespace App\Support\Storage;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;

/**
 * انتقال فایل‌های موجود به ریشهٔ جدید (`TADBIR_FILES_ROOT`).
 *
 * بیرون‌بردن ریشه فقط تغییر تنظیمات نیست: باید محتوای پوشهٔ قدیمی هم منتقل شود
 * و بعد از انتقال، تعداد و حجم دو طرف یکی باشد. این کلاس:
 * - پیش‌فرض خشک‌اجرا (dry-run) است،
 * - با `move` وقتی هر دو مسیر روی یک فایل‌سیستم باشند از rename استفاده می‌کند
 *   (سریع و بدون نیاز به فضای دوبرابر)،
 * - در حالت کپی، فایل مبدأ را تا تأیید `pruneSource` نگه می‌دارد،
 * - و اجرای محدود (`limit`) را پشتیبانی می‌کند تا روی هاست بدون SSH هم در چند
 *   درخواست HTTP کامل شود.
 */
final class StorageRelocator
{
    /** وضعیت دو طرف انتقال: تعداد فایل، حجم، وجود و نوشتنی بودن. */
    public function status(): array
    {
        $from = StoragePaths::legacyFilesRoot();
        $to = StoragePaths::filesRoot();

        return [
            'from' => $from,
            'to' => $to,
            'same_path' => $from === $to,
            'same_device' => $this->sameDevice($from, $to),
            'source' => $this->summary($from),
            'target' => $this->summary($to),
            'files_root_external' => ! StoragePaths::isInsideApplication($to),
        ];
    }

    /**
     * انتقال محدود و تکرارپذیر.
     *
     * @return array{applied:bool,mode:string,processed:int,copied:int,moved:int,skipped:int,failed:int,pending:int,errors:string[]}
     */
    public function run(int $limit = 200, bool $apply = false, bool $move = true, bool $pruneSource = false): array
    {
        $from = rtrim(StoragePaths::legacyFilesRoot(), '/\\');
        $to = rtrim(StoragePaths::filesRoot(), '/\\');

        if ($from === $to) {
            throw new RuntimeException('ریشهٔ فعلی و ریشهٔ جدید یکی است؛ ابتدا TADBIR_FILES_ROOT را تنظیم کنید.');
        }
        if (! is_dir($from)) {
            throw new RuntimeException('پوشهٔ مبدأ پیدا نشد: '.$from);
        }
        if ($apply && ! is_dir($to) && ! @mkdir($to, 0770, true) && ! is_dir($to)) {
            throw new RuntimeException('ساخت پوشهٔ مقصد ممکن نشد: '.$to);
        }
        if ($apply && str_starts_with($from, $to.'/') && $from !== $to) {
            // مقصد داخل مبدأ است: پیمایش بی‌پایان می‌شود، پس رد می‌کنیم.
            throw new RuntimeException('پوشهٔ مقصد داخل پوشهٔ مبدأ است؛ مسیر دیگری انتخاب کنید.');
        }

        $limit = max(1, min($limit, 2000));
        $canRename = $move && $this->sameDevice($from, $to);

        $processed = 0;
        $copied = 0;
        $moved = 0;
        $skipped = 0;
        $failed = 0;
        $errors = [];
        $pending = 0;

        foreach ($this->files($from) as $path) {
            $relative = ltrim(substr($path, strlen($from)), '/\\');
            if ($relative === '') {
                continue;
            }
            $target = $to.DIRECTORY_SEPARATOR.$relative;
            $exists = is_file($target) && filesize($target) === filesize($path);

            if ($exists) {
                $skipped++;
                continue;
            }

            if ($processed >= $limit) {
                $pending++;
                continue;
            }

            $processed++;
            if (! $apply) {
                continue;
            }

            try {
                $directory = dirname($target);
                if (! is_dir($directory) && ! @mkdir($directory, 0770, true) && ! is_dir($directory)) {
                    throw new RuntimeException('ساخت پوشه ممکن نشد: '.$directory);
                }
                if ($canRename && @rename($path, $target)) {
                    $moved++;
                    continue;
                }
                if (! @copy($path, $target)) {
                    throw new RuntimeException('کپی نشد: '.$relative);
                }
                if (filesize($target) !== filesize($path)) {
                    @unlink($target);
                    throw new RuntimeException('حجم کپی‌شده یکسان نیست: '.$relative);
                }
                $copied++;
                if ($pruneSource) {
                    @unlink($path);
                }
            } catch (RuntimeException $exception) {
                $failed++;
                if (count($errors) < 10) {
                    $errors[] = $exception->getMessage();
                }
            }
        }

        return [
            'applied' => $apply,
            'mode' => $canRename ? 'move' : 'copy',
            'processed' => $processed,
            'copied' => $copied,
            'moved' => $moved,
            'skipped' => $skipped,
            'failed' => $failed,
            'pending' => $pending,
            'errors' => $errors,
        ];
    }

    /** @return array{exists:bool,writable:bool,files:int,bytes:int} */
    private function summary(string $path): array
    {
        if (! is_dir($path)) {
            return ['exists' => false, 'writable' => StoragePaths::writable(dirname($path)), 'files' => 0, 'bytes' => 0];
        }

        $files = 0;
        $bytes = 0;
        foreach ($this->files($path) as $file) {
            $files++;
            $bytes += (int) (filesize($file) ?: 0);
        }

        return ['exists' => true, 'writable' => is_writable($path), 'files' => $files, 'bytes' => $bytes];
    }

    /** @return iterable<string> */
    private function files(string $root): iterable
    {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS | \FilesystemIterator::CURRENT_AS_FILEINFO),
            RecursiveIteratorIterator::LEAVES_ONLY,
        );

        foreach ($iterator as $item) {
            /** @var SplFileInfo $item */
            if (! $item->isFile() || $item->isLink()) {
                continue;
            }
            $name = $item->getFilename();
            // فایل‌های نگه‌دارندهٔ Git در پوشهٔ استوریج منتقل نمی‌شوند.
            if ($name === '.gitignore' || $name === '.gitkeep') {
                continue;
            }
            yield $item->getPathname();
        }
    }

    private function sameDevice(string $from, string $to): bool
    {
        $a = $this->nearestExisting($from);
        $b = $this->nearestExisting($to);
        if ($a === null || $b === null) {
            return false;
        }
        $da = @stat($a);
        $db = @stat($b);
        if ($da === false || $db === false) {
            return false;
        }

        return (int) $da['dev'] === (int) $db['dev'];
    }

    /** نزدیک‌ترین پوشهٔ موجود به این مسیر (برای مقایسهٔ دیسک پیش از ساخت مقصد). */
    private function nearestExisting(string $path): ?string
    {
        $cursor = rtrim($path, '/\\');
        $guard = 0;
        while ($cursor !== '' && ! file_exists($cursor) && $guard++ < 50) {
            $parent = dirname($cursor);
            if ($parent === $cursor) {
                return null;
            }
            $cursor = $parent;
        }

        return file_exists($cursor) ? $cursor : null;
    }
}
