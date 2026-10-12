<?php

namespace App\Support\Calendar;

use Carbon\CarbonImmutable;

/** Small dependency-free Jalali conversion used by authoritative Series schedules. */
final class PersianCalendar
{
    /** @return array{year:int,month:int,day:int} */
    public function fromGregorian(CarbonImmutable $date): array
    {
        $gy = $date->year;
        $gm = $date->month;
        $gd = $date->day;
        $offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = $gm > 2 ? $gy + 1 : $gy;
        $days = 355666 + 365 * $gy + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100)
            + intdiv($gy2 + 399, 400) + $gd + $offsets[$gm - 1];
        $jy = -1595 + 33 * intdiv($days, 12053);
        $days %= 12053;
        $jy += 4 * intdiv($days, 1461);
        $days %= 1461;
        if ($days > 365) {
            $jy += intdiv($days - 1, 365);
            $days = ($days - 1) % 365;
        }
        if ($days < 186) {
            $jm = 1 + intdiv($days, 31);
            $jd = 1 + ($days % 31);
        } else {
            $jm = 7 + intdiv($days - 186, 30);
            $jd = 1 + (($days - 186) % 30);
        }

        return ['year' => $jy, 'month' => $jm, 'day' => $jd];
    }

    public function toGregorian(int $jy, int $jm, int $jd): CarbonImmutable
    {
        $jy += 1595;
        $days = -355668 + 365 * $jy + intdiv($jy, 33) * 8 + intdiv(($jy % 33) + 3, 4)
            + $jd + ($jm < 7 ? ($jm - 1) * 31 : ($jm - 7) * 30 + 186);
        $gy = 400 * intdiv($days, 146097);
        $days %= 146097;
        if ($days > 36524) {
            $days--;
            $gy += 100 * intdiv($days, 36524);
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
        $leap = ($gy % 4 === 0 && $gy % 100 !== 0) || $gy % 400 === 0;
        $lengths = [31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        $gm = 1;
        while ($gm <= 12 && $gd > $lengths[$gm - 1]) {
            $gd -= $lengths[$gm - 1];
            $gm++;
        }

        return CarbonImmutable::create($gy, $gm, $gd)->startOfDay();
    }

    public function addMonths(CarbonImmutable $anchor, int $months, ?int $preferredDay = null): CarbonImmutable
    {
        $jalali = $this->fromGregorian($anchor);
        $zeroBased = ($jalali['month'] - 1) + $months;
        $year = $jalali['year'] + (int) floor($zeroBased / 12);
        $month = (($zeroBased % 12) + 12) % 12 + 1;
        $day = min($preferredDay ?? $jalali['day'], $this->daysInMonth($year, $month));

        return $this->toGregorian($year, $month, $day);
    }

    public function daysInMonth(int $year, int $month): int
    {
        if ($month <= 6) {
            return 31;
        }
        if ($month <= 11) {
            return 30;
        }

        return $this->isLeapYear($year) ? 30 : 29;
    }

    public function isLeapYear(int $year): bool
    {
        $breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
        $jp = $breaks[0];
        if ($year < $jp || $year >= $breaks[count($breaks) - 1]) {
            return false;
        }
        $jump = 0;
        foreach (array_slice($breaks, 1) as $jm) {
            $jump = $jm - $jp;
            if ($year < $jm) {
                break;
            }
            $jp = $jm;
        }
        $n = $year - $jp;
        if ($jump - $n < 6) {
            $n = $n - $jump + intdiv($jump + 4, 33) * 33;
        }
        $leap = (($n + 1) % 33 - 1) % 4;
        if ($leap === -1) {
            $leap = 4;
        }

        return $leap === 0;
    }
}
