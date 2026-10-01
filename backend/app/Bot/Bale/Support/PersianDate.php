<?php

namespace App\Bot\Bale\Support;

use Illuminate\Validation\ValidationException;

final class PersianDate
{
    public static function digits(string|int $value): string
    {
        return strtr((string) $value, array_combine(str_split('0123456789'), preg_split('//u', '۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY)));
    }

    /** Normalize stored legacy Jalali action deadlines without interpreting year 1405 as Gregorian. */
    public static function iso(?string $value): ?string
    {
        if (! $value || ! trim($value)) {
            return null;
        }
        $value = strtr(trim($value), array_combine(preg_split('//u', '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', -1, PREG_SPLIT_NO_EMPTY), str_split('01234567890123456789')));
        $invalid = fn () => throw ValidationException::withMessages(['deadline' => 'مهلت باید تاریخ معتبر شمسی یا میلادی باشد.']);
        if (! preg_match('/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/D', $value, $m)) {
            $invalid();
        }
        [$y, $month, $day] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        if ($y >= 1700) {
            if (! checkdate($month, $day, $y)) {
                $invalid();
            }

            return sprintf('%04d-%02d-%02d', $y, $month, $day);
        }
        if ($y < 1300 || $y > 1600 || $month < 1 || $month > 12 || $day < 1 || $day > ($month <= 6 ? 31 : 30)) {
            $invalid();
        }
        $jy = $y + 1595;
        $days = -355668 + 365 * $jy + intdiv($jy, 33) * 8 + intdiv($jy % 33 + 3, 4) + $day + ($month < 7 ? ($month - 1) * 31 : ($month - 7) * 30 + 186);
        $gy = 400 * intdiv($days, 146097);
        $days %= 146097;
        if ($days > 36524) {
            $gy += 100 * intdiv(--$days, 36524);
            $days %= 36524;
            if ($days >= 365) {
                $days++;
            }
        }
        $gy += 4 * intdiv($days, 1461);
        $days %= 1461;
        if ($days > 365) {
            $gy += intdiv($days - 1, 365);
            $days = ($days - 1) % 365;
        }
        $gd = $days + 1;
        $gm = 1;
        $lengths = [31, (($gy % 4 === 0 && $gy % 100 !== 0) || $gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        while ($gm <= 12 && $gd > $lengths[$gm - 1]) {
            $gd -= $lengths[$gm - 1];
            $gm++;
        }
        $iso = sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
        if (self::format($iso) !== self::digits(sprintf('%04d/%02d/%02d', $y, $month, $day))) {
            $invalid();
        }

        return $iso;
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
