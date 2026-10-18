import {
  getDaysInJalaliMonth,
  gregorianToJalali,
  jalaliToGregorian,
  PERSIAN_MONTH_NAMES,
  toPersianDigits,
} from '../../utils/jalali.ts';

/**
 * DS-2.3 DatePicker — pure calendar logic (unit-testable).
 *
 * Calendar arithmetic is NOT re-implemented here: Jalali conversion
 * delegates to the existing, long-tested utils/jalali.ts (round-trip
 * verified 2000–2099). This module only adds ISO plumbing, month-grid
 * construction and range/constraint rules.
 *
 * Date contract: values are date-only ISO strings `YYYY-MM-DD` in
 * the Gregorian calendar (lexicographically comparable). No time,
 * no timezone — a picked day means the same day everywhere.
 */

export type CalendarKind = 'jalali' | 'gregorian';

export const GREGORIAN_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Week starts on Saturday (fa locale), weekday labels ش ی د س چ پ ج. */
export const WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const pad = (value: number) => String(value).padStart(2, '0');

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function partsFromISO(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isValidISODate(iso: string): boolean {
  const parts = partsFromISO(iso);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
}

export function addDaysISO(iso: string, days: number): string {
  const parts = partsFromISO(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Compare two ISO dates lexicographically (valid for YYYY-MM-DD). */
export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The calendar view (year+month in the display calendar) containing an ISO date. */
export function viewOfISO(iso: string, calendar: CalendarKind): { year: number; month: number } {
  const parts = partsFromISO(iso) ?? { year: 2026, month: 1, day: 1 };
  if (calendar === 'gregorian') return { year: parts.year, month: parts.month };
  const jalali = gregorianToJalali(parts.year, parts.month, parts.day);
  return { year: jalali.jy, month: jalali.jm };
}

export function shiftView(view: { year: number; month: number }, deltaMonths: number): { year: number; month: number } {
  const total = view.year * 12 + (view.month - 1) + deltaMonths;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function monthName(view: { year: number; month: number }, calendar: CalendarKind): string {
  return calendar === 'jalali' ? PERSIAN_MONTH_NAMES[view.month - 1] : GREGORIAN_MONTH_NAMES[view.month - 1];
}

export interface CalendarCell {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
}

/** Six-week (42-cell) Saturday-first grid for a display month. */
export function monthCells(view: { year: number; month: number }, calendar: CalendarKind): CalendarCell[] {
  const firstISO = calendar === 'jalali'
    ? (() => { const g = jalaliToGregorian(view.year, view.month, 1); return isoFromParts(g.gy, g.gm, g.gd); })()
    : isoFromParts(view.year, view.month, 1);
  const firstParts = partsFromISO(firstISO) ?? { year: 2026, month: 1, day: 1 };
  const weekday = new Date(Date.UTC(firstParts.year, firstParts.month - 1, firstParts.day)).getUTCDay();
  const offset = (weekday + 1) % 7; // Saturday -> 0
  const startISO = addDaysISO(firstISO, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const iso = addDaysISO(startISO, index);
    const parts = partsFromISO(iso) ?? firstParts;
    if (calendar === 'jalali') {
      const jalali = gregorianToJalali(parts.year, parts.month, parts.day);
      return { iso, day: jalali.jd, inCurrentMonth: jalali.jy === view.year && jalali.jm === view.month };
    }
    return { iso, day: parts.day, inCurrentMonth: parts.year === view.year && parts.month === view.month };
  });
}

export function daysInViewMonth(view: { year: number; month: number }, calendar: CalendarKind): number {
  if (calendar === 'jalali') return getDaysInJalaliMonth(view.year, view.month);
  return new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
}

/** Human label for an ISO date in the display calendar. */
export function formatISODate(iso: string, calendar: CalendarKind): string {
  const parts = partsFromISO(iso);
  if (!parts) return '';
  if (calendar === 'gregorian') return `${parts.day} ${GREGORIAN_MONTH_NAMES[parts.month - 1]} ${parts.year}`;
  const jalali = gregorianToJalali(parts.year, parts.month, parts.day);
  return `${toPersianDigits(jalali.jd)} ${PERSIAN_MONTH_NAMES[jalali.jm - 1]} ${toPersianDigits(jalali.jy)}`;
}

export interface DateConstraints {
  min?: string;
  max?: string;
  disabledDates?: ReadonlySet<string> | readonly string[];
}

export function isDateDisabled(iso: string, constraints: DateConstraints): boolean {
  if (constraints.min && compareISO(iso, constraints.min) < 0) return true;
  if (constraints.max && compareISO(iso, constraints.max) > 0) return true;
  if (constraints.disabledDates) {
    const set = constraints.disabledDates instanceof Set ? constraints.disabledDates : new Set(constraints.disabledDates);
    if (set.has(iso)) return true;
  }
  return false;
}

export interface DateRangeValue {
  start: string;
  end: string;
}

/**
 * Range selection state machine: first click sets the start, second
 * click completes (auto-swapping when earlier), a click after a
 * complete range starts a new range.
 */
export function applyRangeSelection(current: DateRangeValue, iso: string): DateRangeValue {
  if (!current.start || (current.start && current.end)) return { start: iso, end: '' };
  if (compareISO(iso, current.start) < 0) return { start: iso, end: current.start };
  return { start: current.start, end: iso };
}
