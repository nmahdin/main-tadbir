// Persian (Jalali / Shamsi) Date Utilities for Tadbir Media Management System

export interface JalaliDate {
  jy: number; // Jalali year (e.g. 1405)
  jm: number; // Jalali month (1-12)
  jd: number; // Jalali day (1-31)
}

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند'
];

export const PERSIAN_DAY_NAMES = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه'
];

export const PERSIAN_DAY_NAMES_SHORT = [
  'ی',
  'د',
  'س',
  'چ',
  'پ',
  'ج',
  'ش'
];

// Convert English digits to Persian digits
export function toPersianDigits(n: number | string | undefined | null): string {
  if (n === undefined || n === null) return '';
  const str = String(n);
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/[0-9]/g, (w) => persianDigits[parseInt(w, 10)]);
}

// Convert Persian digits to English digits
export function toEnglishDigits(str: string): string {
  if (!str) return '';
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  return res;
}

// Check if Jalali year is a leap year
export function isJalaliLeapYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length;
  let jp = breaks[0];
  let jm: number;
  let jump: number;
  let leap: number;
  let n: number;
  let i: number;

  if (jy < jp || jy >= breaks[bl - 1]) return false;

  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  n = jy - jp;

  if (jump! - n < 6) n = n - jump! + Math.floor((jump! + 4) / 33) * 33;
  leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;

  return leap === 0;
}

// Number of days in a Jalali month
export function getDaysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

// Gregorian to Jalali conversion algorithm
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let jm: number;
  let jd: number;

  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }

  return { jy, jm, jd };
}

// Jalali to Gregorian conversion algorithm
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy = jy + 621;
  let days: number;

  if (jm <= 7) {
    days = (jm - 1) * 31 + jd - 1;
  } else {
    days = 6 * 31 + (jm - 7) * 30 + jd - 1;
  }

  let g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let g_day_no = days + 79;

  let leap = ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0);
  if (leap) {
    g_d_m = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  }

  if (g_day_no >= (leap ? 366 : 365)) {
    g_day_no -= (leap ? 366 : 365);
    gy++;
  }

  let gm = 0;
  for (let i = 0; i < 12; i++) {
    if (g_day_no < (i === 11 ? (leap ? 366 : 365) : g_d_m[i + 1])) {
      gm = i + 1;
      break;
    }
  }

  let gd = g_day_no - g_d_m[gm - 1] + 1;
  return { gy, gm, gd };
}

// Parse any date representation (ISO, YYYY-MM-DD, Jalali string, Date object) to Jalali
export function parseToJalali(dateInput?: string | Date | null): JalaliDate {
  if (!dateInput) {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  if (dateInput instanceof Date) {
    return gregorianToJalali(dateInput.getFullYear(), dateInput.getMonth() + 1, dateInput.getDate());
  }

  const str = toEnglishDigits(String(dateInput).trim());

  // Check if it's already a Jalali string like 1404/05/12 or 1404-05-12
  const jalaliMatch = str.match(/^(13\d{2}|14\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])/);
  if (jalaliMatch) {
    return {
      jy: parseInt(jalaliMatch[1], 10),
      jm: parseInt(jalaliMatch[2], 10),
      jd: parseInt(jalaliMatch[3], 10)
    };
  }

  // Check standard Gregorian date ISO format
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return gregorianToJalali(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// Format a date input to Persian numeric string: e.g. "۱۴۰۵/۰۶/۱۱"
export function formatToJalaliNumber(dateInput?: string | Date | null): string {
  const { jy, jm, jd } = parseToJalali(dateInput);
  const mStr = jm < 10 ? `۰${jm}` : toPersianDigits(jm);
  const dStr = jd < 10 ? `۰${jd}` : toPersianDigits(jd);
  return `${toPersianDigits(jy)}/${mStr}/${dStr}`;
}

// Format a date input to Persian numeric string in English digits: e.g. "1405/06/11"
export function formatToJalaliRaw(dateInput?: string | Date | null): string {
  const { jy, jm, jd } = parseToJalali(dateInput);
  const mStr = jm < 10 ? `0${jm}` : String(jm);
  const dStr = jd < 10 ? `0${jd}` : String(jd);
  return `${jy}/${mStr}/${dStr}`;
}

// Format a date input to long Persian string: e.g. "۱۱ شهریور ۱۴۰۵"
export function formatToJalaliLong(dateInput?: string | Date | null): string {
  const { jy, jm, jd } = parseToJalali(dateInput);
  const monthName = PERSIAN_MONTH_NAMES[jm - 1] || '';
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

// Format a date input with day of week: e.g. "دوشنبه ۱۱ شهریور ۱۴۰۵"
export function formatToJalaliFull(dateInput?: string | Date | null): string {
  let dateObj: Date;
  if (!dateInput) {
    dateObj = new Date();
  } else if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    const { jy, jm, jd } = parseToJalali(dateInput);
    const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
    dateObj = new Date(gy, gm - 1, gd);
  }

  const dayOfWeek = PERSIAN_DAY_NAMES[dateObj.getDay()];
  const { jy, jm, jd } = parseToJalali(dateInput);
  const monthName = PERSIAN_MONTH_NAMES[jm - 1] || '';
  return `${dayOfWeek}، ${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

// Relative time in Persian: e.g. "همین الان", "۵ دقیقه پیش", "۲ ساعت پیش", "دیروز", "۳ روز پیش"
export function toPersianRelativeTime(dateInput?: string | Date | null): string {
  if (!dateInput) return 'نامشخص';
  
  let dateObj: Date;
  if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    const str = String(dateInput);
    // If it's a jalali string with hour like "۱۴۰۵/۰۶/۱۰ - ساعت ۱۴:۳۲"
    if (str.includes('ساعت') || str.includes('پیش')) {
      return toPersianDigits(str);
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    } else {
      return formatToJalaliLong(dateInput);
    }
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'لحظاتی پیش';
  if (diffMin < 60) return `${toPersianDigits(diffMin)} دقیقه پیش`;
  if (diffHour < 24) return `${toPersianDigits(diffHour)} ساعت پیش`;
  if (diffDay === 1) return 'دیروز';
  if (diffDay < 7) return `${toPersianDigits(diffDay)} روز پیش`;
  if (diffDay < 30) return `${toPersianDigits(Math.floor(diffDay / 7))} هفته پیش`;
  if (diffDay < 365) return `${toPersianDigits(Math.floor(diffDay / 30))} ماه پیش`;

  return formatToJalaliLong(dateObj);
}
