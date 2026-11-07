import { jalaliToGregorian, parseToJalali, toEnglishDigits } from './jalali.ts';

/** تاریخ محلی مرورگر (`YYYY-MM-DD`)؛ همان قاعدهٔ `todayLocalISO` بدون وابستگی. */
const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * کلید قابل‌مقایسهٔ تاریخ (`YYYY-MM-DD` میلادی) برای هر شکلی از ورودی.
 *
 * تاریخ در دادهٔ سامانه هم شمسی (`۱۴۰۵/۰۶/۱۵`) و هم میلادی (`2026-09-06`) هست؛
 * فیلتر بازه و مرتب‌سازی نباید بر مقایسهٔ رشته‌ایِ خام تکیه کند. خروجی خالی یعنی
 * «تاریخ معتبری وجود ندارد» — نه «امروز».
 */
export const toIsoDateKey = (value?: string | Date | null): string => {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : localDay(value);
  }
  const raw = toEnglishDigits(String(value).trim());
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && Number(iso[1]) > 1700) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const looksJalali = /^(13|14)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/.test(raw);
  const parsed = new Date(raw);
  if (!looksJalali && Number.isNaN(parsed.getTime())) return '';
  const { jy, jm, jd } = parseToJalali(raw);
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};

