import { PERSIAN_MONTH_NAMES, gregorianToJalali, toPersianDigits } from './jalali';

/** بخش‌های تاریخ میلادی را بدون وابستگی به منطقهٔ زمانی مرورگر استخراج می‌کند. */
const gregorianParts = (value?: string | Date | null): { gy: number; gm: number; gd: number } | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { gy: value.getFullYear(), gm: value.getMonth() + 1, gd: value.getDate() };
  }
  const text = String(value).trim();
  // تاریخ خالص (بدون ساعت) نباید از مسیر UTC عبور کند؛ در غیر این صورت در برخی
  // منطقه‌های زمانی یک روز جابه‌جا نمایش داده می‌شود.
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return { gy: Number(dateOnly[1]), gm: Number(dateOnly[2]), gd: Number(dateOnly[3]) };
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return { gy: parsed.getFullYear(), gm: parsed.getMonth() + 1, gd: parsed.getDate() };
};

/** تاریخ شمسی با نام ماه: «۱۱ شهریور ۱۴۰۵» */
export const formatPersianDateLong = (value?: string | Date | null): string => {
  const parts = gregorianParts(value);
  if (!parts) return value ? String(value) : '';
  const { jy, jm, jd } = gregorianToJalali(parts.gy, parts.gm, parts.gd);
  const monthName = PERSIAN_MONTH_NAMES[jm - 1] || '';
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
};

/** تاریخ شمسی عددی: «۱۴۰۵/۰۶/۱۱» */
export const formatPersianDateNumeric = (value?: string | Date | null): string => {
  const parts = gregorianParts(value);
  if (!parts) return value ? String(value) : '';
  const { jy, jm, jd } = gregorianToJalali(parts.gy, parts.gm, parts.gd);
  return `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, '0'))}/${toPersianDigits(String(jd).padStart(2, '0'))}`;
};

/**
 * ساعت را با ارقام فارسی نمایش می‌دهد. ورودی می‌تواند «۱۸:۳۰»، «18:30:00» یا یک
 * مقدار تاریخ‌زمان ISO باشد. مقدار ذخیره‌شده هرگز تغییر نمی‌کند و فقط نمایش
 * فارسی می‌شود.
 */
export const formatPersianTime = (value?: string | null): string => {
  if (!value) return '';
  const text = String(value).trim();
  if (text === '') return '';
  const clock = text.match(/(\d{1,2}):(\d{2})/);
  if (!clock) return toPersianDigits(text);
  return toPersianDigits(`${clock[1].padStart(2, '0')}:${clock[2]}`);
};

/** «۱۱ شهریور ۱۴۰۵ · ساعت ۱۸:۳۰» — هر بخشی که نیست، نمایش داده نمی‌شود. */
export const formatPersianDateTime = (date?: string | null, time?: string | null): string => {
  const parts = [formatPersianDateLong(date), formatPersianTime(time) && `ساعت ${formatPersianTime(time)}`]
    .filter(part => Boolean(part && part !== 'ساعت '));
  return parts.join(' · ');
};

/** تاریخ‌زمان کامل ISO را به «۱۱ شهریور ۱۴۰۵ · ساعت ۱۸:۳۰» تبدیل می‌کند. */
export const formatPersianIsoDateTime = (value?: string | Date | null): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return formatPersianDateTime(String(value), `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
};

/** اعداد فارسی برای نمایش کمّیت‌ها. */
export const formatPersianNumber = (value?: number | string | null): string => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return value.toLocaleString('fa-IR');
  return toPersianDigits(value);
};

/** تاریخ شمسی طولانی؛ نام قبلی برای سازگاری با فراخوانی‌های موجود. */
export const formatPersianDate = (dateStr?: string) => formatPersianDateLong(dateStr);
