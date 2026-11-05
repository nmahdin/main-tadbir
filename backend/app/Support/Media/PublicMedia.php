<?php

namespace App\Support\Media;

/**
 * نشانی رسانه‌های عمومی سامانه (عکس پروفایل، لوگو و فاوآیکون).
 *
 * چرا مسیر `/storage/...` کافی نیست: پنل و API می‌توانند روی دو دامنهٔ جدا
 * سرو شوند و پوشهٔ `public/storage` (لینک نمادین) هم روی همهٔ میزبان‌ها ساخته
 * نمی‌شود؛ نتیجه این بود که تصویرها در مرورگر شکسته می‌ماندند. این کلاس یک
 * مسیر واحد و همیشه‌کار می‌سازد: `/api/v1/media/<path>` روی همان میزبانِ API
 * که درخواست به آن رسیده است. فایل هم از دیسک عمومی خوانده و همان‌جا سرو
 * می‌شود، پس هیچ وابستگی‌ای به لینک نمادین یا دامنهٔ پنل باقی نمی‌ماند.
 *
 * دامنهٔ مجاز عمداً بسته است: فقط دو پوشهٔ `avatars` و `brand` و فقط نام
 * فایل‌های امن؛ بنابراین مسیر پیمایش (`../`) و فایل‌های خصوصی سرو نمی‌شوند.
 */
final class PublicMedia
{
    /** پوشه‌های مجاز روی دیسک عمومی. */
    public const DIRECTORIES = ['avatars', 'brand'];

    private const SAFE_PATH = '#^(avatars|brand)/[A-Za-z0-9][A-Za-z0-9._-]*$#';

    /**
     * مسیر کانونیک روی دیسک عمومی از هر شکلی که ذخیره شده باشد.
     *
     * ورودی می‌تواند `avatars/x.png`، `/storage/avatars/x.png`،
     * `https://host/storage/avatars/x.png` یا نشانی همین مسیر جدید باشد.
     */
    public static function path(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        // میزبان و پارامترهای اضافی (مثل `?v=`) حذف می‌شوند؛ فقط مسیر می‌ماند.
        $path = parse_url($value, PHP_URL_PATH);
        $path = is_string($path) ? $path : $value;
        $path = ltrim($path, '/');
        $path = (string) preg_replace('#^(api/v1/media|storage)/#', '', $path);

        if (preg_match(self::SAFE_PATH, $path) !== 1) {
            return null;
        }

        // فایل اجرایی/اسکریپتی هرگز از این مسیر سرو نمی‌شود؛ فقط تصویر raster.
        return preg_match('#\.(svg|html?|php\d?|js|mjs)$#i', $path) === 1 ? null : $path;
    }

    /**
     * نشانی مطلق و همیشه‌در‌دسترس برای مرورگر؛ رشتهٔ خالی یعنی «فایلی ثبت نشده».
     *
     * مقادیر بیرونی (مثل تصویر نمونهٔ دمو با نشانی کامل) دست‌نخورده برمی‌گردند
     * تا هیچ داده‌ای در نمایش بی‌دلیل پاک نشود.
     */
    public static function url(mixed $value): string
    {
        if (! is_string($value)) {
            return '';
        }
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        $path = self::path($value);

        return $path === null ? $value : self::base().'/api/v1/media/'.$path;
    }

    /**
     * ریشهٔ دامنه‌ای که API روی آن سرو می‌شود.
     *
     * اولویت با دامنهٔ همان درخواست است (مرورگر دقیقاً همین میزبان را صدا زده
     * است) و در نبود آن (اجرای CLI/صف) از `APP_URL` استفاده می‌شود.
     */
    private static function base(): string
    {
        if (app()->bound('request')) {
            $root = trim((string) request()->root());
            if (preg_match('#^https?://#i', $root) === 1) {
                return rtrim($root, '/');
            }
        }

        $configured = trim((string) config('app.url'));

        return rtrim(preg_match('#^https?://#i', $configured) === 1 ? $configured : 'http://localhost', '/');
    }

    /** شکل ذخیره‌سازی در تنظیمات/ستون‌های پایگاه داده (همان قرارداد قبلی). */
    public static function storedPath(mixed $value): string
    {
        if (! is_string($value)) {
            return '';
        }
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        $path = self::path($value);

        return $path === null ? $value : '/storage/'.$path;
    }
}
