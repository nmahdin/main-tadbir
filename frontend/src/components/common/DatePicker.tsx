import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button, Select } from './Primitives';
import {
  WEEKDAY_LABELS,
  addDaysISO,
  applyRangeSelection,
  formatISODate,
  isDateDisabled,
  isValidISODate,
  monthCells,
  monthName,
  shiftView,
  viewOfISO,
  type CalendarKind,
  type DateRangeValue,
} from './datePickerLogic';

export type { CalendarKind, DateRangeValue };

/**
 * DS-2.3 accessible DatePicker (RTL-first).
 *
 * Values are date-only ISO strings (`YYYY-MM-DD`, Gregorian) — the
 * backend contract. The display calendar can be Jalali (default) or
 * Gregorian; conversion delegates to the tested utils/jalali.ts, no
 * new dependency and no hand-rolled calendar arithmetic. Date-time
 * is deliberately out of scope: this control picks whole days, and
 * callers needing a time compose it separately.
 *
 * Keyboard: arrows move by day/week (RTL-aware), PageUp/PageDown by
 * month, Enter/Space select, Escape closes and refocuses the
 * trigger. Disabled dates (min/max/list) are real disabled buttons.
 */

export interface DatePickerProps {
  id?: string;
  calendar?: CalendarKind;
  selection?: 'single' | 'range';
  value?: string;
  onChange?: (iso: string) => void;
  rangeValue?: DateRangeValue;
  onRangeChange?: (range: DateRangeValue) => void;
  min?: string;
  max?: string;
  disabledDates?: readonly string[];
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function DatePicker({
  id,
  calendar = 'jalali',
  selection = 'single',
  value = '',
  onChange,
  rangeValue,
  onRangeChange,
  min,
  max,
  disabledDates,
  disabled = false,
  invalid = false,
  clearable = true,
  placeholder = 'انتخاب تاریخ',
  ariaLabel,
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const initialAnchor = (selection === 'range' ? rangeValue?.start : value) || todayISO();
  const [view, setView] = useState(() => viewOfISO(initialAnchor, calendar));
  const [focusedISO, setFocusedISO] = useState(initialAnchor);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const range = rangeValue ?? { start: '', end: '' };
  const constraints = useMemo(() => ({ min, max, disabledDates }), [min, max, disabledDates]);
  const cells = useMemo(() => monthCells(view, calendar), [view, calendar]);

  const anchorISO = selection === 'range' ? (range.start || todayISO()) : (value || todayISO());

  const openPopup = () => {
    if (disabled) return;
    const anchor = isValidISODate(anchorISO) ? anchorISO : todayISO();
    setView(viewOfISO(anchor, calendar));
    setFocusedISO(anchor);
    setOpen(true);
  };

  const closePopup = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) closePopup();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open ]);

  // Keep DOM focus on the focused day button while navigating.
  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector<HTMLElement>(`[data-iso="${focusedISO}"]`)?.focus();
  }, [open, focusedISO, view]);

  const pick = (iso: string) => {
    if (isDateDisabled(iso, constraints)) return;
    if (selection === 'range') {
      const next = applyRangeSelection(range, iso);
      onRangeChange?.(next);
      if (next.start && next.end) closePopup(true);
      return;
    }
    onChange?.(iso);
    closePopup(true);
  };

  const moveFocus = (nextISO: string) => {
    setFocusedISO(nextISO);
    const nextView = viewOfISO(nextISO, calendar);
    if (nextView.year !== view.year || nextView.month !== view.month) setView(nextView);
  };

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const rtl = document.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) { event.preventDefault(); moveFocus(addDaysISO(focusedISO, 1)); }
    else if (event.key === backward) { event.preventDefault(); moveFocus(addDaysISO(focusedISO, -1)); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(addDaysISO(focusedISO, 7)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(addDaysISO(focusedISO, -7)); }
    else if (event.key === 'PageDown') { event.preventDefault(); const next = shiftView(view, 1); setView(next); moveFocus(addDaysISO(focusedISO, 30)); }
    else if (event.key === 'PageUp') { event.preventDefault(); const next = shiftView(view, -1); setView(next); moveFocus(addDaysISO(focusedISO, -30)); }
    else if (event.key === 'Escape') { event.preventDefault(); closePopup(true); }
  };

  const displayText = selection === 'range'
    ? (range.start ? `${formatISODate(range.start, calendar)}${range.end ? ` تا ${formatISODate(range.end, calendar)}` : ' تا …'}` : '')
    : (value ? formatISODate(value, calendar) : '');

  const hasValue = selection === 'range' ? Boolean(range.start) : Boolean(value);
  const clear = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (selection === 'range') onRangeChange?.({ start: '', end: '' });
    else onChange?.('');
  };

  const years = useMemo(() => {
    const span: number[] = [];
    for (let year = view.year - 6; year <= view.year + 6; year += 1) span.push(year);
    return span;
  }, [view.year]);

  const inRange = (iso: string) => selection === 'range' && range.start && range.end && iso > range.start && iso < range.end;
  const today = todayISO();

  return (
    <div ref={wrapperRef} className={`ui-select ${className}`} dir="rtl">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        data-invalid={invalid || undefined}
        className="ui-select-trigger"
        onClick={() => (open ? closePopup() : openPopup())}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className={`ui-select-value ${displayText ? '' : 'ui-select-placeholder'}`}>{displayText || placeholder}</span>
        {hasValue && clearable && !disabled && (
          <span
            role="button"
            aria-label="پاک‌کردن تاریخ"
            tabIndex={-1}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={clear}
            onMouseDown={event => event.preventDefault()}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </button>

      {open && (
        <div ref={popupRef} className="ui-select-popup ui-datepicker-popup" role="dialog" aria-label={ariaLabel ?? 'انتخاب تاریخ'}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="flex items-center gap-1">
              <Select
                aria-label="سال"
                value={String(view.year)}
                onChange={event => setView(current => ({ ...current, year: Number(event.target.value) }))}
                className="w-24"
              >
                {years.map(year => <option key={year} value={year}>{calendar === 'jalali' ? year.toLocaleString('fa-IR', { useGrouping: false }) : year}</option>)}
              </Select>
              <Select
                aria-label="ماه"
                value={String(view.month)}
                onChange={event => setView(current => ({ ...current, month: Number(event.target.value) }))}
                className="w-28"
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{monthName({ year: view.year, month: index + 1 }, calendar)}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="ماه قبل" onClick={() => setView(current => shiftView(current, -1))}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" aria-label="ماه بعد" onClick={() => setView(current => shiftView(current, 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 px-3 pt-2 text-center text-[11px] font-bold text-slate-400" aria-hidden>
            {WEEKDAY_LABELS.map((label, index) => <span key={index} className="py-1">{label}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-1 p-3 pt-1" onKeyDown={onGridKeyDown}>
            {cells.map(cell => {
              const isSelected = selection === 'range'
                ? cell.iso === range.start || cell.iso === range.end
                : cell.iso === value;
              const cellDisabled = isDateDisabled(cell.iso, constraints);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-iso={cell.iso}
                  disabled={cellDisabled}
                  tabIndex={cell.iso === focusedISO ? 0 : -1}
                  aria-label={formatISODate(cell.iso, calendar)}
                  aria-pressed={isSelected || undefined}
                  aria-current={cell.iso === today ? 'date' : undefined}
                  onClick={() => pick(cell.iso)}
                  onFocus={() => setFocusedISO(cell.iso)}
                  className={`ui-calendar-day ${cell.inCurrentMonth ? '' : 'ui-calendar-day-outside'} ${isSelected ? 'ui-calendar-day-selected' : ''} ${inRange(cell.iso) ? 'ui-calendar-day-inrange' : ''} ${cell.iso === today ? 'ui-calendar-day-today' : ''}`}
                >
                  {calendar === 'jalali' ? cell.day.toLocaleString('fa-IR') : cell.day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => pick(today)}>امروز</Button>
            {selection === 'range' && <span className="text-[11px] text-slate-500">{range.start && !range.end ? 'تاریخ پایان را انتخاب کنید' : 'بازهٔ انتخاب‌شده'}</span>}
            <Button variant="ghost" size="sm" onClick={() => closePopup(true)}>بستن</Button>
          </div>
        </div>
      )}
    </div>
  );
}
