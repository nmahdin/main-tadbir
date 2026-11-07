<?php

namespace App\Support\Storage;

use App\Models\SystemSetting;
use Throwable;

/**
 * محل ذخیرهٔ فایل‌ها، قابل تعیین از داخل پنل (بدون نیاز به SSH).
 *
 * منبع حقیقت سه‌لایه است:
 *   ۱) مقدار ثبت‌شده در تنظیمات سامانه (`system_settings.storage.files_root`) — همین‌جا؛
 *   ۲) متغیر محیطی `TADBIR_FILES_ROOT`؛
 *   ۳) پیش‌فرض `storage/app/private`.
 *
 * مقدار تنظیمات در هر درخواست روی پیکربندی دیسک `local` نشانده می‌شود، بنابراین
 * همهٔ نویسنده‌های فایل (DAM، پیوست گفتگو، پیوست محتوا) همان مسیر را می‌بینند.
 * اگر مسیر ثبت‌شده ناسالم باشد (ساخت‌نشدنی یا نانوشتنی)، عمداً رها می‌شود تا پنل
 * با مسیر پیش‌فرض سالم بماند و مدیر بتواند اصلاحش کند.
 */
final class StorageSettings
{
    public const KEY = 'storage';

    private static ?array $values = null;

    /** @return array{files_root?:string|null,previous_roots?:list<string>} */
    public static function values(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        try {
            $stored = SystemSetting::query()->where('key', self::KEY)->value('value');
        } catch (Throwable) {
            // جدول تنظیمات هنوز ساخته نشده است (اجرای مهاجرت‌ها یا نصب تازه).
            return self::$values = [];
        }

        if (is_string($stored)) {
            $decoded = json_decode($stored, true);
            $stored = is_array($decoded) ? $decoded : [];
        }

        return self::$values = is_array($stored) ? $stored : [];
    }

    /** مسیر ثبت‌شده در تنظیمات (اگر مدیر تعیین کرده باشد). */
    public static function configuredFilesRoot(): ?string
    {
        $path = self::values()['files_root'] ?? null;

        return is_string($path) && trim($path) !== '' ? rtrim(trim($path), '/\\') : null;
    }

    /** مسیرهای قبلی برای انتقال فایل‌ها هنگام تغییر محل ذخیره‌سازی. */
    public static function previousRoots(): array
    {
        $roots = self::values()['previous_roots'] ?? [];

        return is_array($roots) ? array_values(array_filter($roots, 'is_string')) : [];
    }

    /** منبع مسیر فعلی: تنظیمات پنل، متغیر محیطی یا پیش‌فرض. */
    public static function source(): string
    {
        if (self::configuredFilesRoot() !== null) {
            return 'settings';
        }
        if (StoragePaths::externalFilesRoot() !== null) {
            return 'env';
        }

        return 'default';
    }

    /**
     * ثبت محل ذخیره‌سازی از پنل.
     *
     * @return array{files_root:string,external:bool,previous:?string,changed:bool}
     */
    public static function setFilesRoot(string $path): array
    {
        $path = rtrim(trim($path), '/\\');
        $current = StoragePaths::filesRoot();
        $changed = $path !== $current;

        $values = self::values();
        $previousRoots = array_values(array_filter(self::previousRoots(), fn (string $root): bool => $root !== $path));

        if ($changed) {
            array_unshift($previousRoots, $current);
        }

        $values['files_root'] = $path;
        $values['previous_roots'] = array_values(array_slice(array_unique($previousRoots), 0, 5));

        SystemSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            ['value' => $values, 'updated_by' => auth()->id()],
        );

        self::$values = $values;
        self::apply();

        return [
            'files_root' => $path,
            'external' => ! StoragePaths::isInsideApplication($path),
            'previous' => $changed ? $current : null,
            'changed' => $changed,
        ];
    }

    /** آیا این مسیر برای ذخیره‌سازی قابل استفاده است (ساخت/نوشتن آزمایشی)؟ */
    public static function usable(string $path): bool
    {
        $path = rtrim(trim($path), '/\\');

        if ($path === '' || ! str_starts_with(str_replace('\\', '/', $path), '/')) {
            return false;
        }

        if (! is_dir($path) && ! @mkdir($path, 0770, true) && ! is_dir($path)) {
            return false;
        }

        $probe = $path.'/.tadbir-write-test';

        if (@file_put_contents($probe, 'ok') === false) {
            return false;
        }

        @unlink($probe);

        return true;
    }

    /** نشاندن مسیر ثبت‌شده روی پیکربندی دیسک `local`. */
    public static function apply(): void
    {
        $path = self::configuredFilesRoot();

        if ($path === null) {
            return;
        }

        try {
            if (! is_dir($path) && ! @mkdir($path, 0770, true) && ! is_dir($path)) {
                return;
            }
            if (! is_writable($path)) {
                return;
            }
        } catch (Throwable) {
            return;
        }

        config(['filesystems.disks.local.root' => $path]);
    }

    public static function forget(): void
    {
        self::$values = null;
    }
}
