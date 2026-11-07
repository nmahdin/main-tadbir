<?php

namespace App\Support\Calendar;

use Carbon\CarbonImmutable;
use Throwable;

/**
 * نمایش تاریخِ شمسی برای متن‌های سرور (اعلان‌ها، پیام بله، خلاصه‌ها).
 *
 * چرا این کلاس: متن اعلان‌ها در سرور ساخته می‌شود و کاربر آن را همان‌جا
 * می‌خواند؛ اگر تاریخ در آن میلادی (`2026-11-02`) بیاید، با بقیهٔ سامانه که
 * همه‌جا شمسی است ناهمخوان می‌شود. اینجا یک تبدیل کوچک و بدون وابستگی، با رقم
 * فارسی، همان قالب `۱۴۰۵/۰۸/۱۱` را می‌دهد که در اپ هم دیده می‌شود.
 *
 * در صورت خطای تبدیل، ورودی به‌صورت خام برگردانده می‌شود تا متن اعلان هرگز
 * خالی یا شکسته نشود.
 */
final class JalaliDate
{
    /** رقم‌های لاتین → فارسی. */
    private const DIGITS = ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹'];

    /** تاریخ شمسی عددی: «۱۴۰۵/۰۸/۱۱». */
    public static function short(string $isoDate): string
    {
        try {
            $jalali = app(PersianCalendar::class)->fromGregorian(CarbonImmutable::parse(substr($isoDate, 0, 10)));
            $formatted = sprintf('%04d/%02d/%02d', $jalali['year'] ?? 0, $jalali['month'] ?? 0, $jalali['day'] ?? 0);
        } catch (Throwable) {
            $formatted = substr($isoDate, 0, 10);
        }

        return strtr($formatted, self::DIGITS);
    }

    /** تاریخ شمسی با ساعت (اگر ساعتی ثبت شده باشد): «۱۴۰۵/۰۸/۱۱ · ۱۸:۳۰». */
    public static function shortWithTime(string $isoDate, ?string $time = null): string
    {
        $date = self::short($isoDate);
        $time = is_string($time) ? trim(substr($time, 0, 5)) : '';

        return $time === '' ? $date : $date.' · '.strtr($time, self::DIGITS);
    }
}
