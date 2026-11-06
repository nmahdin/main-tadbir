<?php

namespace App\Support\Media;

use App\Models\DamFile;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * بندانگشتی سبک برای تصاویر مخزن دارایی‌ها.
 *
 * چرا لازم شد: کارت‌ها و ردیف‌های مخزن فقط یک کادر ۴۰–۳۲۰ پیکسلی دارند، اما
 * نشانی `preview` همان فایل اصلی را stream می‌کرد؛ یعنی یک نمای شبکه‌ای با
 * بیست تصویر موبایلی می‌توانست ده‌ها مگابایت از اینترنت کاربر را بخورد.
 *
 * این کلاس نسخهٔ کوچک را یک‌بار می‌سازد و روی دیسک کش می‌کند؛ بعد از آن همان
 * فایل کوچک سرو می‌شود. اگر هیچ افزونهٔ تصویری (Imagick/GD) روی سرور نصب
 * نباشد، `null` برمی‌گرداند تا فراخواننده به همان فایل اصلی برگردد و
 * بندانگشتی هرگز «خالی» نماند.
 */
final class DamThumbnail
{
    /** پهنای مجاز؛ مقدار دیگر به پیش‌فرض تبدیل می‌شود تا کش بی‌نهایت نشود. */
    public const WIDTHS = [96, 160, 320, 640];

    public const DEFAULT_WIDTH = 320;

    /** پوشهٔ کش نسبت به ریشهٔ دیسک عمومی. */
    private const CACHE_FOLDER = 'dam-thumbnails';

    public function width(mixed $requested): int
    {
        $value = (int) $requested;

        return in_array($value, self::WIDTHS, true) ? $value : self::DEFAULT_WIDTH;
    }

    /**
     * نسخهٔ کوچک همین فایل؛ اگر ساخت ممکن نباشد `null`.
     *
     * @return array{path: string, mime: string, etag: string, mtime: int}|null
     */
    public function forFile(DamFile $file, int $width): ?array
    {
        $source = $this->absoluteSource($file);
        if ($source === null) {
            return null;
        }

        $stem = $this->cacheStem($file, $width);
        foreach (['webp', 'jpg'] as $extension) {
            $path = $stem.'.'.$extension;
            if (is_file($path) && is_readable($path) && filesize($path) > 0) {
                return $this->describe($path, $file, $width);
            }
        }

        $produced = $this->render($source, $width, $stem);

        return $produced === null ? null : $this->describe($produced, $file, $width);
    }

    /** مسیر مطلق فایل اصلی روی همین سرور (اگر دیسک محلی باشد). */
    private function absoluteSource(DamFile $file): ?string
    {
        try {
            if (! Storage::disk($file->storage_disk)->exists($file->storage_path)) {
                return null;
            }
            $path = Storage::disk($file->storage_disk)->path($file->storage_path);
        } catch (Throwable) {
            // دیسک ابری مسیر محلی ندارد؛ تبدیل در محل ممکن نیست.
            return null;
        }

        return is_file($path) && is_readable($path) ? $path : null;
    }

    /**
     * ریشهٔ نام فایل کش (بدون پسوند).
     *
     * نام فایل شامل حجم، اثر انگشت و زمان تغییر نسخه است تا ویرایش فایل، نسخهٔ
     * تازه بسازد و بندانگشتیِ کهنه دیده نشود.
     */
    private function cacheStem(DamFile $file, int $width): string
    {
        try {
            $root = Storage::disk('public')->path(self::CACHE_FOLDER);
        } catch (Throwable) {
            $root = sys_get_temp_dir().'/tadbir-dam-thumbs';
        }

        if (! is_dir($root) && ! @mkdir($root, 0o775, true) && ! is_dir($root)) {
            $root = sys_get_temp_dir();
        }

        $fingerprint = substr(sha1(implode('|', [
            $file->storage_path, (string) $file->file_size, (string) $file->checksum, (string) $file->updated_at,
        ])), 0, 12);

        return sprintf('%s/%s-%d-%s', rtrim($root, '/'), $file->id ?: 'file', $width, $fingerprint);
    }

    /** مسیر فایل خروجی؛ پسوند بر اساس موتور و پشتیبانی WebP انتخاب می‌شود. */
    private function render(string $source, int $width, string $stem): ?string
    {
        if ($this->imagickSupportsWebp()) {
            $target = $stem.'.webp';
            try {
                if ($this->renderWithImagick($source, $width, $target)) {
                    return $target;
                }
            } catch (Throwable) {
                // سراغ GD می‌رویم.
            }
        } elseif (class_exists(\Imagick::class)) {
            $target = $stem.'.jpg';
            try {
                if ($this->renderWithImagick($source, $width, $target)) {
                    return $target;
                }
            } catch (Throwable) {
                // سراغ GD می‌رویم.
            }
        }

        if (function_exists('imagecreatefromstring')) {
            $target = $this->gdSupportsWebp() ? $stem.'.webp' : $stem.'.jpg';
            try {
                if ($this->renderWithGd($source, $width, $target, str_ends_with($target, '.webp'))) {
                    return $target;
                }
            } catch (Throwable) {
                // تبدیل ناموفق: فراخواننده به فایل اصلی برمی‌گردد.
            }
        }

        return null;
    }

    private function imagickSupportsWebp(): bool
    {
        if (! class_exists(\Imagick::class)) {
            return false;
        }
        try {
            return \Imagick::queryFormats('WEBP') !== [];
        } catch (Throwable) {
            return false;
        }
    }

    private function gdSupportsWebp(): bool
    {
        return function_exists('imagewebp') && (imagetypes() & IMG_WEBP) === IMG_WEBP;
    }

    private function renderWithImagick(string $source, int $width, string $target): bool
    {
        $image = new \Imagick($source);
        $image->setIteratorIndex(0);
        // چرخش بر اساس EXIF تا عکس موبایل کج نمایش داده نشود (اگر نسخهٔ Imagick
        // این متد را داشته باشد).
        if (method_exists($image, 'autoOrient')) {
            $image->autoOrient();
        }
        $image->thumbnailImage($width, 0, true, true);
        $image->stripImage();
        $image->setImageCompressionQuality(78);
        $image->writeImage($target);
        $image->clear();

        return is_file($target) && filesize($target) > 0;
    }

    private function renderWithGd(string $source, int $width, string $target, bool $webp): bool
    {
        $bytes = @file_get_contents($source);
        if ($bytes === false || $bytes === '') {
            return false;
        }
        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            return false;
        }

        $original = imagesx($image);
        $scaled = $original > $width ? imagescale($image, $width, -1, IMG_BILINEAR_FIXED) : $image;
        if ($scaled === false) {
            imagedestroy($image);

            return false;
        }

        $written = $webp ? @imagewebp($scaled, $target, 78) : @imagejpeg($scaled, $target, 82);

        if ($scaled !== $image) {
            imagedestroy($scaled);
        }
        imagedestroy($image);

        return (bool) $written && is_file($target) && filesize($target) > 0;
    }

    /** @return array{path: string, mime: string, etag: string, mtime: int} */
    private function describe(string $path, DamFile $file, int $width): array
    {
        $mtime = (int) @filemtime($path);

        return [
            'path' => $path,
            'mime' => str_ends_with($path, '.webp') ? 'image/webp' : 'image/jpeg',
            'etag' => sprintf('"dam-thumb-%s-%d-%s"', (string) ($file->id ?: 'file'), $width, substr(sha1($path), 0, 10)),
            'mtime' => $mtime > 0 ? $mtime : time(),
        ];
    }
}
