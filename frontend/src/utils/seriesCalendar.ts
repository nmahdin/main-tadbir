/**
 * منطق خالص «تقویم مجموعه‌های محتوا».
 *
 * روز هر دوره فقط از دادهٔ واقعی ساخته می‌شود: دوره‌های محاسبه‌شدهٔ سرور
 * (`schedule-preview`) برای دوره‌های آینده و پرونده‌های محتوای موجود برای
 * دوره‌های ثبت‌شده. هیچ روزی حدس زده یا ساخته نمی‌شود؛ دوره‌ای که تاریخ معتبر
 * ندارد در تقویم نمی‌آید. این ماژول هیچ وابستگی اجرایی ندارد تا آزمون‌های نود
 * بتوانند مستقیم آن را بارگذاری کنند و ریاضی تقویم دوباره پیاده نشود.
 */

/** منبع دورهٔ محاسبه‌شدهٔ سرور (زیرمجموعهٔ SeriesPeriodPreview). */
export interface SeriesCalendarPeriod {
  sequence?: number | null;
  periodKey?: string | null;
  periodLabel?: string | null;
  title?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  publicationDate?: string | null;
  publicationTime?: string | null;
}

/** منبع پروندهٔ محتوای ثبت‌شده (زیرمجموعهٔ Content). */
export interface SeriesCalendarOccurrence {
  id: string;
  title?: string | null;
  code?: string | null;
  seriesSequence?: number | null;
  periodKey?: string | null;
  deadline?: string | null;
  plannedStartAt?: string | null;
  publishInfo?: { date?: string | null; time?: string | null } | null;
}

export interface SeriesCalendarSeries {
  id: string;
  name: string;
}

export type SeriesCalendarEntryState = 'planned' | 'created';

export interface SeriesCalendarEntry {
  /** کلید یکتا برای لیست‌ها. */
  key: string;
  seriesId: string;
  seriesName: string;
  /** شمارهٔ دوره؛ برای پرونده‌های قدیمی بدون شماره، `null`. */
  sequence: number | null;
  title: string;
  periodLabel: string;
  /** روزی که چیپ روی آن می‌نشیند (تاریخ انتشار/دورهٔ محتوای مجموعه). */
  day: string;
  deadline: string | null;
  time: string | null;
  state: SeriesCalendarEntryState;
  /** شناسهٔ پروندهٔ محتوای ثبت‌شده؛ برای دورهٔ محاسبه‌شده خالی است. */
  contentId: string | null;
}

export interface SeriesCalendarSeriesRow {
  seriesId: string;
  seriesName: string;
  entries: SeriesCalendarEntry[];
}

/**
 * یک رنگ ثابت برای هر مجموعه. کلاس‌ها رشتهٔ ثابت‌اند چون Tailwind نسخهٔ ۴
 * کلاس‌های پویا را نمی‌سازد. `accent` رنگ لبهٔ راست چیپ است.
 */
export const SERIES_CALENDAR_TONES = [
  { dot: 'bg-indigo-500', chip: 'border-indigo-200 bg-indigo-50 text-indigo-800', accent: 'border-r-indigo-500', label: 'text-indigo-700' },
  { dot: 'bg-emerald-500', chip: 'border-emerald-200 bg-emerald-50 text-emerald-800', accent: 'border-r-emerald-500', label: 'text-emerald-700' },
  { dot: 'bg-amber-500', chip: 'border-amber-200 bg-amber-50 text-amber-900', accent: 'border-r-amber-500', label: 'text-amber-700' },
  { dot: 'bg-sky-500', chip: 'border-sky-200 bg-sky-50 text-sky-800', accent: 'border-r-sky-500', label: 'text-sky-700' },
  { dot: 'bg-rose-500', chip: 'border-rose-200 bg-rose-50 text-rose-800', accent: 'border-r-rose-500', label: 'text-rose-700' },
  { dot: 'bg-violet-500', chip: 'border-violet-200 bg-violet-50 text-violet-800', accent: 'border-r-violet-500', label: 'text-violet-700' },
  { dot: 'bg-teal-500', chip: 'border-teal-200 bg-teal-50 text-teal-800', accent: 'border-r-teal-500', label: 'text-teal-700' },
  { dot: 'bg-orange-500', chip: 'border-orange-200 bg-orange-50 text-orange-900', accent: 'border-r-orange-500', label: 'text-orange-700' },
  { dot: 'bg-cyan-500', chip: 'border-cyan-200 bg-cyan-50 text-cyan-800', accent: 'border-r-cyan-500', label: 'text-cyan-700' },
  { dot: 'bg-fuchsia-500', chip: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800', accent: 'border-r-fuchsia-500', label: 'text-fuchsia-700' },
  { dot: 'bg-lime-500', chip: 'border-lime-200 bg-lime-50 text-lime-900', accent: 'border-r-lime-500', label: 'text-lime-700' },
  { dot: 'bg-slate-500', chip: 'border-slate-200 bg-slate-50 text-slate-700', accent: 'border-r-slate-500', label: 'text-slate-700' },
] as const;

/** رنگ متناظر با ترتیب مجموعه در فهرست؛ برای تعداد بیش از پالت، از ابتدا تکرار می‌شود. */
export function seriesCalendarTone(index: number) {
  const tones = SERIES_CALENDAR_TONES;
  if (!Number.isFinite(index) || index < 0) return tones[tones.length - 1];
  return tones[Math.trunc(index) % tones.length];
}

/**
 * تاریخ روز به شکل `YYYY-MM-DD`. مقدارهای ISO datetime هم بریده می‌شوند و
 * مقدارهای نامعتبر `null` می‌شوند تا روز ساختگی وارد تقویم نشود.
 */
export function normalizeSeriesCalendarDay(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

const trimText = (value?: string | null): string => (typeof value === 'string' ? value.trim() : '');

/**
 * تبدیل دوره‌های محاسبه‌شدهٔ سرور به چیپ‌های تقویم.
 * روز چیپ تاریخ انتشار دوره است و در نبود آن، تاریخ شروع.
 */
export function seriesCalendarEntriesFromPeriods(
  series: SeriesCalendarSeries,
  periods?: SeriesCalendarPeriod[] | null,
): SeriesCalendarEntry[] {
  return (periods || []).flatMap(period => {
    const day = normalizeSeriesCalendarDay(period.publicationDate) || normalizeSeriesCalendarDay(period.startDate);
    if (!day) return [];
    const sequence = Number.isFinite(Number(period.sequence)) ? Number(period.sequence) : null;
    return [{
      key: `planned:${series.id}:${period.periodKey || sequence || day}`,
      seriesId: series.id,
      seriesName: series.name,
      sequence,
      title: trimText(period.title) || trimText(period.periodLabel) || series.name,
      periodLabel: trimText(period.periodLabel),
      day,
      deadline: normalizeSeriesCalendarDay(period.deadline),
      time: trimText(period.publicationTime) || null,
      state: 'planned' as const,
      contentId: null,
    }];
  });
}

/**
 * تبدیل پرونده‌های محتوای موجود به چیپ‌های تقویم. روز چیپ تاریخ انتشار پرونده
 * است و در نبود آن، تاریخ شروع برنامه‌ریزی‌شده و سپس مهلت.
 */
export function seriesCalendarEntriesFromOccurrences(
  series: SeriesCalendarSeries,
  occurrences?: SeriesCalendarOccurrence[] | null,
): SeriesCalendarEntry[] {
  return (occurrences || []).flatMap(occurrence => {
    const day = normalizeSeriesCalendarDay(occurrence.publishInfo?.date)
      || normalizeSeriesCalendarDay(occurrence.plannedStartAt)
      || normalizeSeriesCalendarDay(occurrence.deadline);
    if (!day) return [];
    const sequence = Number.isFinite(Number(occurrence.seriesSequence)) ? Number(occurrence.seriesSequence) : null;
    return [{
      key: `created:${series.id}:${occurrence.id}`,
      seriesId: series.id,
      seriesName: series.name,
      sequence,
      title: trimText(occurrence.title) || trimText(occurrence.code) || series.name,
      periodLabel: trimText(occurrence.periodKey),
      day,
      deadline: normalizeSeriesCalendarDay(occurrence.deadline),
      time: trimText(occurrence.publishInfo?.time) || null,
      state: 'created' as const,
      contentId: occurrence.id,
    }];
  });
}

/**
 * چیپ‌های یک مجموعه: دوره‌های ثبت‌شده و دوره‌های محاسبه‌شده.
 * اگر یک شمارهٔ دوره هم ثبت‌شده و هم محاسبه‌شده باشد، نسخهٔ ثبت‌شده می‌ماند.
 */
export function seriesCalendarEntries(input: {
  series: SeriesCalendarSeries;
  periods?: SeriesCalendarPeriod[] | null;
  occurrences?: SeriesCalendarOccurrence[] | null;
}): SeriesCalendarEntry[] {
  const planned = seriesCalendarEntriesFromPeriods(input.series, input.periods);
  const created = seriesCalendarEntriesFromOccurrences(input.series, input.occurrences);
  const merged = new Map<string, SeriesCalendarEntry>();
  [...planned, ...created].forEach(entry => {
    const key = entry.sequence !== null ? `${entry.seriesId}#${entry.sequence}` : entry.key;
    const previous = merged.get(key);
    if (!previous || entry.state === 'created') merged.set(key, entry);
  });

  return [...merged.values()].sort((left, right) =>
    left.day === right.day
      ? (left.sequence ?? 0) - (right.sequence ?? 0)
      : left.day < right.day ? -1 : 1);
}

/** گروه‌بندی چیپ‌ها بر پایهٔ روز تقویمی (`YYYY-MM-DD`). */
export function groupSeriesCalendarEntries(entries: SeriesCalendarEntry[]): Record<string, SeriesCalendarEntry[]> {
  return entries.reduce<Record<string, SeriesCalendarEntry[]>>((grouped, entry) => {
    grouped[entry.day] = [...(grouped[entry.day] || []), entry];
    return grouped;
  }, {});
}

/**
 * روزهای هر مجموعه در بازهٔ جاری تقویم، به همان ترتیب فهرست.
 * مجموعه‌های بدون روز در بازه حذف می‌شوند تا فهرست روزها فقط دادهٔ واقعی نشان دهد.
 */
export function seriesCalendarSeriesRows(
  entries: SeriesCalendarEntry[],
  seriesOrder: SeriesCalendarSeries[],
  days: string[],
): SeriesCalendarSeriesRow[] {
  const range = new Set(days);
  const inRange = entries.filter(entry => range.has(entry.day));

  return seriesOrder.flatMap(series => {
    const seriesEntries = inRange.filter(entry => entry.seriesId === series.id);
    if (!seriesEntries.length) return [];
    return [{
      seriesId: series.id,
      seriesName: series.name,
      entries: seriesEntries.sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : 0)),
    }];
  });
}
