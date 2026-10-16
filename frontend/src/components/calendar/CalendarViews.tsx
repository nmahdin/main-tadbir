import React from 'react';
import { addDays, addMonths, format, getDay, getDaysInMonth, startOfMonth, subDays, subMonths } from 'date-fns-jalali';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * تقویم مشترک سامانه (نمای تقویم و تقویم انتشار).
 *
 * سه نما پشتیبانی می‌شود — ماهانه، هفتگی و سه‌هفتگی — و چیدمان برای موبایل
 * بهینه است: نمای ماهانه روی صفحهٔ کوچک افقی اسکرول می‌شود تا ستون‌ها فشرده
 * نشوند و نماهای هفتگی/سه‌هفتگی روی موبایل به شکل فهرست روزها (نه هفت ستون
 * به‌هم‌چسبیده) نمایش داده می‌شوند. همهٔ اعداد و برچسب‌ها فارسی‌اند و هیچ
 * رویدادی ساخته نمی‌شود؛ هر تقویم رویدادهای واقعی خودش را رندر می‌کند.
 */

export type CalendarRangeMode = 'month' | 'week' | 'threeWeeks';

export const CALENDAR_RANGE_MODES: Array<{ id: CalendarRangeMode; label: string; hint: string }> = [
  { id: 'month', label: 'ماهانه', hint: 'همهٔ روزهای ماه' },
  { id: 'week', label: 'هفتگی', hint: 'هفت روز' },
  { id: 'threeWeeks', label: 'سه‌هفتگی', hint: 'بیست‌ویک روز' },
];

/** هفتهٔ ایرانی از شنبه شروع می‌شود. */
export const CALENDAR_WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export type CalendarDay = {
  /** کلید یکتا برای لیست‌ها. */
  key: string;
  date: Date;
  /** تاریخ میلادی به شکل `YYYY-MM-DD`؛ مقایسهٔ رویدادها با همین رشته انجام می‌شود. */
  iso: string;
  dayNumber: number;
  persianDay: string;
  weekday: string;
  isToday: boolean;
  /** آیا روز داخل بازهٔ انتخاب‌شده است (روزهای کناری ماه در نمای ماهانه: نه). */
  inPeriod: boolean;
};

const toPersianDigits = (value: number | string): string =>
  String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

/** ستون روز در هفتهٔ شنبه‌محور: شنبه = ۰ … جمعه = ۶. */
export const jalaliWeekColumn = (date: Date): number => (getDay(date) + 1) % 7;

/** شنبهٔ همان هفته. */
export const startOfJalaliWeek = (date: Date): Date => subDays(date, jalaliWeekColumn(date));

/** تاریخ محلی به شکل `YYYY-MM-DD` بدون لغزش منطقهٔ زمانی. */
export const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const buildDay = (date: Date, anchor: Date, mode: CalendarRangeMode, periodStart: Date, periodEnd: Date): CalendarDay => ({
  key: `${isoDay(date)}-${mode}`,
  date,
  iso: isoDay(date),
  dayNumber: date.getDate(),
  persianDay: toPersianDigits(date.getDate()),
  weekday: CALENDAR_WEEKDAYS[jalaliWeekColumn(date)],
  isToday: isoDay(date) === isoDay(new Date()),
  inPeriod: date >= periodStart && date <= periodEnd,
});

/**
 * روزهای قابل نمایش برای هر نما.
 * - ماهانه: کل ماه جلالی به‌همراه روزهای تکمیل‌کنندهٔ هفته‌های اول و آخر.
 * - هفتگی: هفت روز از شنبهٔ هفتهٔ جاری.
 * - سه‌هفتگی: بیست‌ویک روز از شنبهٔ هفتهٔ جاری.
 */
export function buildCalendarDays(anchor: Date, mode: CalendarRangeMode): CalendarDay[] {
  if (mode === 'month') {
    const monthStart = startOfMonth(anchor);
    const monthEnd = addDays(monthStart, getDaysInMonth(anchor) - 1);
    const gridStart = startOfJalaliWeek(monthStart);
    const trailing = (7 - ((jalaliWeekColumn(monthStart) + getDaysInMonth(anchor)) % 7)) % 7;
    const total = getDaysInMonth(anchor) + jalaliWeekColumn(monthStart) + trailing;

    return Array.from({ length: total }, (_, index) => buildDay(addDays(gridStart, index), anchor, mode, monthStart, monthEnd));
  }

  const start = startOfJalaliWeek(anchor);
  const length = mode === 'week' ? 7 : 21;
  return Array.from({ length }, (_, index) => buildDay(addDays(start, index), anchor, mode, start, addDays(start, length - 1)));
}

/** جابه‌جایی بازهٔ تقویم: ماه، هفته یا سه هفته. */
export function shiftCalendarAnchor(anchor: Date, mode: CalendarRangeMode, direction: -1 | 1): Date {
  if (mode === 'month') return direction === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);

  return addDays(anchor, (mode === 'week' ? 7 : 21) * direction);
}

/** برچسب فارسی بازهٔ جاری؛ ماهانه فقط نام ماه، و هفتگی/سه‌هفتگی بازهٔ تاریخ. */
export function calendarRangeLabel(anchor: Date, mode: CalendarRangeMode): string {
  if (mode === 'month') return format(anchor, 'MMMM yyyy');

  const start = startOfJalaliWeek(anchor);
  const end = addDays(start, mode === 'week' ? 6 : 20);
  return `${format(start, 'd MMMM')} تا ${format(end, 'd MMMM yyyy')}`;
}

export interface CalendarRangeToolbarProps {
  mode: CalendarRangeMode;
  onModeChange: (mode: CalendarRangeMode) => void;
  label: string;
  title: string;
  hint?: string;
  onShift: (direction: -1 | 1) => void;
  onToday: () => void;
  busy?: boolean;
}

/** نوار مشترک تقویم: عنوان بازه، انتخاب نما و پیمایش. */
export const CalendarRangeToolbar: React.FC<CalendarRangeToolbarProps> = ({
  mode,
  onModeChange,
  label,
  title,
  hint,
  onShift,
  onToday,
  busy = false,
}) => (
  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <CalendarDays className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-black text-slate-900 sm:text-base">{title}</h3>
        <p className="mt-0.5 text-[11px] font-bold text-slate-600">
          {label}
          {hint ? <span className="mr-2 font-medium text-slate-400">· {hint}</span> : null}
        </p>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="بازهٔ نمایش تقویم">
        {CALENDAR_RANGE_MODES.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            title={item.hint}
            onClick={() => onModeChange(item.id)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors sm:px-3 ${mode === item.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5" dir="ltr">
        <button type="button" onClick={() => onShift(-1)} disabled={busy} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50" aria-label="بازهٔ قبل">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToday} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">
          امروز
        </button>
        <button type="button" onClick={() => onShift(1)} disabled={busy} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50" aria-label="بازهٔ بعد">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
);

export interface CalendarGridProps {
  days: CalendarDay[];
  mode: CalendarRangeMode;
  /** رویدادهای همان روز؛ هر تقویم دادهٔ واقعی خودش را می‌دهد. */
  renderEvents: (day: CalendarDay) => React.ReactNode;
  eventCount?: (day: CalendarDay) => number;
  onSelectDay?: (day: CalendarDay) => void;
  /** نشان روزهای خالی در نمای فهرست موبایل. */
  emptyDayLabel?: string;
  /**
   * اندازهٔ خانه‌های روز. «large» برای تقویم‌های پررویداد (مثل تقویم مجموعه‌ها)
   * که باید درشت و خوانا باشند؛ پیش‌فرض همان اندازهٔ فعلی سامانه است.
   */
  size?: 'comfortable' | 'large';
  busy?: boolean;
}

const DayBadge: React.FC<{ day: CalendarDay; count: number; large?: boolean }> = ({ day, count, large = false }) => (
  <div className="flex items-center justify-between gap-1">
    <span className={`font-black ${large ? 'text-[13px] sm:text-sm' : 'text-[11px]'} ${day.isToday ? 'text-indigo-700' : day.inPeriod ? 'text-slate-700' : 'text-slate-400'}`}>
      {day.persianDay}
    </span>
    {count > 0 && (
      <span className={`rounded-full bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600 ${large ? 'text-[10px]' : 'text-[9px]'}`}>
        {toPersianDigits(count)}
      </span>
    )}
  </div>
);

/**
 * شبکهٔ روزها. نمای ماهانه روی صفحهٔ کوچک افقی اسکرول می‌شود (ستون‌ها فشرده
 * نمی‌شوند) و نماهای هفتگی/سه‌هفتگی روی موبایل فهرست روزها را نشان می‌دهند.
 */
export const CalendarGrid: React.FC<CalendarGridProps> = ({
  days,
  mode,
  renderEvents,
  eventCount,
  onSelectDay,
  emptyDayLabel = 'رویدادی ثبت نشده است.',
  size = 'comfortable',
  busy = false,
}) => {
  const large = size === 'large';
  const countOf = (day: CalendarDay) => (eventCount ? eventCount(day) : 0);
  const cell = (day: CalendarDay) => {
    const body = (
      <>
        <DayBadge day={day} count={countOf(day)} large={large} />
        <div className={`space-y-1 ${large ? 'mt-2 sm:space-y-1.5' : 'mt-1.5'}`}>{renderEvents(day)}</div>
      </>
    );
    const className = `w-full rounded-xl border text-right transition-colors ${large ? 'min-h-[132px] p-2.5 sm:min-h-[176px]' : 'min-h-[92px] p-2 sm:min-h-[112px]'} ${
      day.isToday ? 'border-indigo-300 bg-indigo-50/40' : day.inPeriod ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60'
    } ${onSelectDay ? 'cursor-pointer hover:border-indigo-300' : ''}`;

    return onSelectDay
      ? <button type="button" onClick={() => onSelectDay(day)} className={className} aria-label={`روز ${day.persianDay} ${day.weekday}`}>{body}</button>
      : <div className={className}>{body}</div>;
  };

  if (mode === 'month') {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-500 sm:text-xs">
          {CALENDAR_WEEKDAYS.map(weekday => <div key={weekday} className="truncate py-1">{weekday}</div>)}
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-1" role="region" aria-label="شبکهٔ روزهای ماه">
          <div className="grid min-w-[44rem] grid-cols-7 gap-1.5">{days.map(day => <React.Fragment key={day.key}>{cell(day)}</React.Fragment>)}</div>
        </div>
        <p className="text-[10px] font-bold text-slate-400 sm:hidden">برای دیدن همهٔ روزها جدول را افقی بکشید.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-500 sm:grid">
        {CALENDAR_WEEKDAYS.map(weekday => <div key={weekday} className="truncate py-1">{weekday}</div>)}
      </div>
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-1.5">{days.map(day => <React.Fragment key={day.key}>{cell(day)}</React.Fragment>)}</div>
      </div>
      <div className="space-y-2 sm:hidden">
        {days.map(day => (
          <article
            key={day.key}
            className={`rounded-2xl border ${large ? 'p-3.5' : 'p-3'} ${day.isToday ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}
          >
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-black ${day.isToday ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {day.persianDay}
                </span>
                <span className="text-[11px] font-bold text-slate-600">{day.weekday}</span>
                {day.isToday && <span className="rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-[9px] font-black text-indigo-700">امروز</span>}
              </div>
              {countOf(day) > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{toPersianDigits(countOf(day))} رویداد</span>
              )}
            </header>
            <div className="mt-2 space-y-1.5">
              {countOf(day) > 0 ? renderEvents(day) : <p className="text-[10px] font-bold text-slate-400">{emptyDayLabel}</p>}
            </div>
          </article>
        ))}
      </div>
      {busy && <p className="text-[10px] font-bold text-slate-400">در حال به‌روزرسانی رویدادهای این بازه…</p>}
    </div>
  );
};
