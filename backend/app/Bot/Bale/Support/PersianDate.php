<?php

namespace App\Bot\Bale\Support;

final class PersianDate
{
    public static function digits(string|int $value): string
    {
        return strtr((string) $value, array_combine(str_split('0123456789'), preg_split('//u', '۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY)));
    }

    /** Gregorian date-only -> solar Hijri; no timezone conversion or extra PHP extension needed. */
    public static function format(mixed $value): string
    {
        if (! $value) {
            return 'تعیین نشده';
        }
        $text = $value instanceof \DateTimeInterface ? $value->format('Y-m-d') : (string) $value;
        $text = strtr($text, array_combine(preg_split('//u', '۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY), str_split('0123456789')));
        if (! preg_match('/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/D', $text, $m)) {
            return MessageText::plain(self::digits($text), 80);
        }
        [$gy, $gm, $gd] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        if ($gy < 1700) {
            return self::digits(sprintf('%04d/%02d/%02d', $gy, $gm, $gd));
        } // existing Persian meeting dates
        if (! checkdate($gm, $gd, $gy)) {
            return 'تاریخ نامعتبر';
        }
        $offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = $gm > 2 ? $gy + 1 : $gy;
        $days = 355666 + 365 * $gy + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100) + intdiv($gy2 + 399, 400) + $gd + $offsets[$gm - 1];
        $jy = -1595 + 33 * intdiv($days, 12053);
        $days %= 12053;
        $jy += 4 * intdiv($days, 1461);
        $days %= 1461;
        if ($days > 365) {
            $jy += intdiv($days - 1, 365);
            $days = ($days - 1) % 365;
        }
        $jm = $days < 186 ? 1 + intdiv($days, 31) : 7 + intdiv($days - 186, 30);
        $jd = 1 + ($days < 186 ? $days % 31 : ($days - 186) % 30);

        return self::digits(sprintf('%04d/%02d/%02d', $jy, $jm, $jd));
    }
}
