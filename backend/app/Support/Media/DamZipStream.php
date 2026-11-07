<?php

namespace App\Support\Media;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * ساخت و ارسال زیپِ «دانلود گروهی» دارایی‌ها.
 *
 * چرا بدون `ZipArchive`: روی بعضی میزبان‌های اشتراکی افزونهٔ zip نصب نیست و
 * قابلیت بی‌صدا از کار می‌افتد؛ همچنین ساختن زیپ روی دیسک، برای فایل‌های
 * چندگیگابایتی فضای دوبل می‌خواهد. اینجا زیپ به‌صورت **جریانی** روی همان
 * خروجی نوشته می‌شود و هیچ نسخهٔ موقتی پشت خود نمی‌گذارد.
 *
 * روش فشرده‌سازی «ذخیره» (`STORE`) است: محتوای مخزن عمدتاً ویدیو، تصویر و PDF
 * است که با deflate عملاً کوچک نمی‌شود ولی پردازنده و زمان دانلود را می‌بلعد.
 *
 * ساختار استاندارد PKZIP 2.0 با هدرهای کامل: اندازه و CRC هر فایل پیش از
 * نوشتن هدر محلی محاسبه می‌شود (یک‌بار خواندن برای CRC، یک‌بار برای نوشتن)،
 * بنابراین هیچ «data descriptor» جریانی لازم نیست و همهٔ ابزارهای بازکردن
 * زیپ (ویندوز، مک، Info-ZIP، Python) آن را باز می‌کنند.
 */
final class DamZipStream
{
    /**
     * @param  array<int, array{name: string, disk: string, path: string}>  $entries
     */
    public function __construct(private array $entries, private string $filename)
    {
    }

    public function response(): StreamedResponse
    {
        $entries = $this->entries;
        $filename = $this->filename;

        return response()->streamDownload(
            fn () => self::write($entries),
            $filename,
            [
                'Content-Type' => 'application/zip',
                // زیپِ ساخته‌شده را کش نکن؛ هر بار محتوای لحظهٔ خودش را دارد.
                'Cache-Control' => 'no-store, private',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }

    /**
     * نوشتن زیپ روی خروجی؛ برای آزمون هم قابل صدا زدن است.
     *
     * @param  array<int, array{name: string, disk: string, path: string}>  $entries
     */
    public static function write(array $entries): void
    {
        $out = fopen('php://output', 'wb');
        if ($out === false) {
            return;
        }

        $offset = 0;
        $central = '';
        $count = 0;
        $used = [];

        foreach ($entries as $entry) {
            $disk = Storage::disk($entry['disk']);
            $path = $entry['path'];
            if (! $disk->exists($path)) {
                continue;
            }

            $size = (int) $disk->size($path);
            $crc = self::checksum($entry['disk'], $path);
            if ($crc === null) {
                continue;
            }

            $name = self::uniqueName($entry['name'], $used);
            $nameLength = strlen($name);
            $modified = self::modifiedAt($entry['disk'], $path);

            // هدر محلی فایل + نام (۳۰ بایت + نام)
            fwrite($out, pack(
                'VvvvvvVVVvv',
                0x04034b50,
                20,          // نسخهٔ لازم
                0x0000,      // بدون پرچم؛ اندازه‌ها از قبل معلوم است
                0,           // روش ذخیره
                self::dosTime($modified),
                self::dosDate($modified),
                $crc,
                $size,
                $size,
                $nameLength,
                0,
            ));
            fwrite($out, $name);
            self::copyFile($out, $entry['disk'], $path, $size);

            $central .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20,          // نسخهٔ سازنده
                20,          // نسخهٔ لازم
                0x0000,
                0,
                self::dosTime($modified),
                self::dosDate($modified),
                $crc,
                $size,
                $size,
                $nameLength,
                0,
                0,
                0,
                0,
                0,
                $offset,
            ).$name;

            $offset += 30 + $nameLength + $size;
            $count++;
        }

        $centralSize = strlen($central);
        if ($central !== '') {
            fwrite($out, $central);
        }

        // پایان دایرکتوری مرکزی
        fwrite($out, pack('VvvvvVVv', 0x06054b50, 0, 0, $count, $count, $centralSize, $offset, 0));
        fclose($out);
    }

    /** CRC32 فایل به‌صورت عدد صحیح ۳۲بیتی (همان چیزی که هدر زیپ می‌خواهد). */
    private static function checksum(string $disk, string $path): ?int
    {
        $stream = Storage::disk($disk)->readStream($path);
        if (! is_resource($stream)) {
            return null;
        }

        $hash = hash_init('crc32b');
        while (! feof($stream)) {
            $chunk = fread($stream, 262144);
            if ($chunk === false) {
                break;
            }
            if ($chunk === '') {
                continue;
            }
            hash_update($hash, $chunk);
        }
        fclose($stream);

        return (int) hexdec(hash_final($hash));
    }

    /** کپی بایت‌به‌بایت فایل روی خروجی، بدون خواندن کل فایل در حافظه. */
    private static function copyFile($out, string $disk, string $path, int $size): void
    {
        $stream = Storage::disk($disk)->readStream($path);
        if (! is_resource($stream)) {
            // فضای فایل در زیپ از قبل رزرو شده است؛ با صفر پر می‌شود تا ساختار
            // زیپ خراب نشود.
            self::pad($out, $size);

            return;
        }

        $written = 0;
        while (! feof($stream)) {
            $chunk = fread($stream, 262144);
            if ($chunk === false) {
                break;
            }
            if ($chunk === '') {
                continue;
            }
            fwrite($out, $chunk);
            $written += strlen($chunk);
        }
        fclose($stream);

        if ($written < $size) {
            self::pad($out, $size - $written);
        }
    }

    /** پر کردن خروجی با بایت صفر، تکه‌تکه تا حافظه پر نشود. */
    private static function pad($out, int $bytes): void
    {
        while ($bytes > 0) {
            $chunk = min($bytes, 1048576);
            fwrite($out, str_repeat("\0", $chunk));
            $bytes -= $chunk;
        }
    }

    /** نام یکتا و امن داخل زیپ (بدون مسیر پیمایش و بدون کاراکتر کنترلی). */
    private static function uniqueName(string $raw, array &$used): string
    {
        $name = str_replace(['\\', '/', "\0", "\r", "\n", "\t"], '-', trim($raw));
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?: '');
        if ($name === '' || $name === '.' || $name === '..') {
            $name = 'file';
        }
        if (mb_strlen($name) > 120) {
            $extension = pathinfo($name, PATHINFO_EXTENSION);
            $base = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 100);
            $name = $extension === '' ? $base : $base.'.'.$extension;
        }

        $candidate = $name;
        $counter = 2;
        while (isset($used[mb_strtolower($candidate)])) {
            $extension = pathinfo($name, PATHINFO_EXTENSION);
            $base = pathinfo($name, PATHINFO_FILENAME);
            $candidate = $extension === '' ? $base.' ('.$counter.')' : $base.' ('.$counter.').'.$extension;
            $counter++;
        }
        $used[mb_strtolower($candidate)] = true;

        return $candidate;
    }

    private static function modifiedAt(string $disk, string $path): int
    {
        try {
            $timestamp = Storage::disk($disk)->lastModified($path);
        } catch (\Throwable) {
            $timestamp = 0;
        }

        return is_int($timestamp) && $timestamp > 0 ? $timestamp : time();
    }

    /** زمان DOS (ثانیه با دقت ۲ ثانیه). */
    private static function dosTime(int $timestamp): int
    {
        $parts = getdate($timestamp);

        return ($parts['hours'] << 11) | ($parts['minutes'] << 5) | intdiv($parts['seconds'], 2);
    }

    /** تاریخ DOS (از سال ۱۹۸۰). */
    private static function dosDate(int $timestamp): int
    {
        $parts = getdate($timestamp);
        $year = max(1980, (int) $parts['year']) - 1980;

        return ($year << 9) | ((int) $parts['mon'] << 5) | (int) $parts['mday'];
    }
}
