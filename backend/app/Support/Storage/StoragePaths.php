<?php

namespace App\Support\Storage;

/**
 * یک منبع حقیقت برای «فایل‌ها کجا هستند» و «پشتیبان‌ها کجا می‌روند».
 *
 * ریشهٔ فایل‌ها همان ریشهٔ دیسک `local` است تا هیچ‌جای دیگری مسیر دوم ساخته
 * نشود. پیش‌فرض پشتیبان کنار ریشهٔ فایل‌ها (بیرون نرم‌افزار هنگام استقرار
 * بیرون‌برده) قرار می‌گیرد تا پاک‌سازی پوشهٔ نرم‌افزار پشتیبان‌ها را از بین نبرد.
 */
final class StoragePaths
{
    /** ریشهٔ مطلق فایل‌های کاربر (DAM، پیوست گفتگو و ...). */
    public static function filesRoot(): string
    {
        return self::normalize((string) config('filesystems.disks.local.root', storage_path('app/private')));
    }

    /** مقدار صریح TADBIR_FILES_ROOT یا null وقتی ریشه همان پیش‌فرض داخل نرم‌افزار است. */
    public static function externalFilesRoot(): ?string
    {
        $configured = env('TADBIR_FILES_ROOT');
        if (! is_string($configured) || trim($configured) === '') {
            return null;
        }

        return self::normalize($configured);
    }

    /** مسیر قدیمی فایل‌ها؛ فقط دستور انتقال از آن استفاده می‌کند. */
    public static function legacyFilesRoot(): string
    {
        return self::normalize((string) (config('tadbir.files_legacy_root') ?: storage_path('app/private')));
    }

    /** ریشهٔ مطلق پشتیبان‌ها. */
    public static function backupRoot(): string
    {
        $configured = config('tadbir.backup_root');
        if (is_string($configured) && trim($configured) !== '') {
            return self::normalize($configured);
        }

        $filesRoot = self::filesRoot();
        if (! self::isInsideApplication($filesRoot)) {
            return dirname($filesRoot).DIRECTORY_SEPARATOR.'tadbir-backups';
        }

        return self::normalize(storage_path('backups'));
    }

    /** آیا این مسیر داخل پوشهٔ نرم‌افزار است؟ (پوشه‌ای که با آپدیت بازنویسی می‌شود) */
    public static function isInsideApplication(?string $path = null): bool
    {
        $path = self::normalize($path ?? self::filesRoot());
        $base = self::normalize(base_path());

        return $path === $base || str_starts_with($path.DIRECTORY_SEPARATOR, $base.DIRECTORY_SEPARATOR);
    }

    /** آیا پوشه قابل نوشتن است؟ برای گزارش پیش از عملیات. */
    public static function writable(string $path): bool
    {
        return is_dir($path) ? is_writable($path) : is_writable(dirname($path));
    }

    /** فضای آزاد دیسک میزبان به بایت (اگر قابل تعیین نباشد null). */
    public static function freeBytes(?string $path = null): ?int
    {
        $target = $path ?? self::filesRoot();
        while ($target !== '' && ! is_dir($target)) {
            $parent = dirname($target);
            if ($parent === $target) {
                return null;
            }
            $target = $parent;
        }

        $free = @disk_free_space($target);

        return is_float($free) || is_int($free) ? (int) $free : null;
    }

    /** مسیر مطلق یک فایل روی دیسک مشخص (برای نمایش به مدیر کل). */
    public static function filePath(string $disk, string $relativePath): ?string
    {
        $root = config("filesystems.disks.{$disk}.root");
        if (! is_string($root) || $root === '') {
            return null;
        }

        return rtrim(self::normalize($root), '/\\').DIRECTORY_SEPARATOR.ltrim($relativePath, '/\\');
    }

    /** ریشهٔ دیسک (برای نمایش مسیر ذخیره به مدیر کل). */
    public static function diskRoot(string $disk): ?string
    {
        $root = config("filesystems.disks.{$disk}.root");

        return is_string($root) && $root !== '' ? self::normalize($root) : null;
    }

    /** دیسک‌های محلی فایلی که پشتیبان‌گیری فایل باید پوشش دهد. */
    public static function localDisks(): array
    {
        $disks = [];
        foreach ((array) config('filesystems.disks', []) as $name => $config) {
            if (($config['driver'] ?? null) === 'local') {
                $disks[$name] = self::normalize((string) ($config['root'] ?? ''));
            }
        }

        return $disks;
    }

    private static function normalize(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '';
        }
        if (function_exists('realpath')) {
            $real = realpath($path);
            if (is_string($real) && $real !== '') {
                return $real;
            }
        }

        return rtrim($path, '/\\');
    }
}
