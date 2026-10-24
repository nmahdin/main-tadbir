/**
 * رنگ و ترتیب «رویداد تقویم» — بدون وابستگی تا در آزمون‌های نود هم مستقیم خوانده شود.
 *
 * قاعدهٔ رنگی همان قاعدهٔ مهلت‌های سامانه است، اما فاصلهٔ زمانی را برای تقویم
 * گویاتر می‌کند: مهلت گذشته → بنفش، امروز → قرمز، تا یک هفتهٔ آینده → کهربایی،
 * بعدتر → آبی آرام، انجام‌شده/تعیین‌تکلیف‌شده → سبز. رنگ فقط نمایش است و هیچ
 * تاریخی را تغییر نمی‌دهد.
 */

export type CalendarDueTone = 'settled' | 'past' | 'today' | 'soon' | 'later' | 'unknown';

export interface CalendarDueInfo {
  tone: CalendarDueTone;
  /** تعداد روز تا مهلت؛ گذشته منفی است و تاریخ نامعتبر `null`. */
  days: number | null;
}

/** افق «نزدیک» در تقویم: یک هفتهٔ آینده. */
export const CALENDAR_SOON_DAYS = 7;

const dayStamp = (value?: string | Date | null): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) : null;
  }
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
};

/**
 * ردهٔ رنگی رویداد بر اساس تاریخ سررسیدش.
 * `settled` یعنی کار بسته شده است (تکمیل/آرشیو/انتشار) و رنگ خنثای سبز می‌گیرد.
 */
export const calendarDueInfo = (
  due?: string | Date | null,
  options: { settled?: boolean; today?: Date; soonDays?: number } = {},
): CalendarDueInfo => {
  if (options.settled) return { tone: 'settled', days: null };
  const target = dayStamp(due);
  const reference = dayStamp(options.today ?? new Date());
  if (target === null || reference === null) return { tone: 'unknown', days: null };
  const days = Math.round((target - reference) / 86_400_000);
  if (days < 0) return { tone: 'past', days };
  if (days === 0) return { tone: 'today', days };
  if (days <= (options.soonDays ?? CALENDAR_SOON_DAYS)) return { tone: 'soon', days };
  return { tone: 'later', days };
};

export const calendarDueTone = (
  due?: string | Date | null,
  options: { settled?: boolean; today?: Date; soonDays?: number } = {},
): CalendarDueTone => calendarDueInfo(due, options).tone;

/** کلاس‌های ظاهری کارت رویداد برای هر رده؛ کارت‌ها درشت‌اند و حاشیهٔ رنگی دارند. */
export const CALENDAR_DUE_CARD: Record<CalendarDueTone, string> = {
  settled: 'border-emerald-200 bg-emerald-50/70',
  past: 'border-violet-300 bg-violet-50/80',
  today: 'border-rose-300 bg-rose-50/80',
  soon: 'border-amber-300 bg-amber-50/80',
  later: 'border-sky-200 bg-sky-50/60',
  unknown: 'border-slate-200 bg-white',
};

/** رنگ نقطه/آیکن همان رده، برای نشانگرهای کوچک. */
export const CALENDAR_DUE_DOT: Record<CalendarDueTone, string> = {
  settled: 'bg-emerald-500 text-emerald-600',
  past: 'bg-violet-500 text-violet-600',
  today: 'bg-rose-500 text-rose-600',
  soon: 'bg-amber-500 text-amber-600',
  later: 'bg-sky-500 text-sky-600',
  unknown: 'bg-slate-400 text-slate-500',
};

/** برچسب کوتاه فارسی ردهٔ مهلت (کنار تاریخ در کارت). */
export const CALENDAR_DUE_LABEL: Record<CalendarDueTone, string> = {
  settled: 'تعیین‌تکلیف‌شده',
  past: 'مهلت گذشته',
  today: 'مهلت امروز',
  soon: 'مهلت نزدیک',
  later: 'مهلت بعدتر',
  unknown: 'بدون مهلت',
};

/** متن کوتاه «چند روز مانده / چند روز گذشته» برای نشانگر کارت. */
export const calendarDueRelative = (info: CalendarDueInfo): string => {
  if (info.tone === 'settled') return 'انجام‌شده';
  if (info.days === null) return '';
  if (info.days === 0) return 'امروز';
  if (info.days > 0) return `${info.days.toLocaleString('fa-IR')} روز مانده`;
  return `${Math.abs(info.days).toLocaleString('fa-IR')} روز گذشته`;
};

/** کلید زمانی برای مرتب‌سازی؛ رویداد بدون ساعت آخر فهرست می‌آید. */
export const calendarTimeKey = (value?: string | null): string => {
  const match = String(value ?? '').match(/(?:^|[T\s])(\d{1,2}):(\d{2})/);
  if (!match) return '99:99';
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * مرتب‌سازی پایدار رویدادهای یک روز بر اساس ساعت.
 * رویدادهای بدون ساعت ترتیب اصلی خود را نگه می‌دارند و در پایان می‌آیند.
 */
export function sortCalendarEventsByTime<T>(events: readonly T[], timeOf: (event: T) => string | undefined | null): T[] {
  return events
    .map((event, index) => ({ event, index, key: calendarTimeKey(timeOf(event)) }))
    .sort((first, second) => (first.key === second.key ? first.index - second.index : first.key < second.key ? -1 : 1))
    .map(row => row.event);
}

/** ساعت خوانا برای نمایش؛ ورودی ناقص رشتهٔ خالی برمی‌گرداند. */
export const calendarTimeLabel = (value?: string | null): string => {
  const key = calendarTimeKey(value);
  return key === '99:99' ? '' : key;
};
