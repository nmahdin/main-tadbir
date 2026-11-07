import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  parseToJalali,
  formatToJalaliLong,
  getDaysInJalaliMonth,
  PERSIAN_MONTH_NAMES,
  toPersianDigits,
  jalaliToGregorian
} from '../../utils/jalali';

interface PersianDatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  className?: string;
  required?: boolean;
  portal?: boolean;
  /**
   * `panel` = فقط خودِ تقویم، بدون فیلد ورودی.
   *
   * برای جاهایی که کلیک روی یک تراشه/برچسب تاریخ باید **مستقیم** تقویم را باز
   * کند (مثل مهلت مرحله در جریان محتوا)؛ پیش‌تر یک پنجرهٔ کوچک باز می‌شد و
   * کاربر باید دوباره روی فیلد داخل آن کلیک می‌کرد.
   */
  variant?: 'field' | 'panel';
  /** با انتخاب روز یا بستن پنل صدا زده می‌شود؛ فقط در حالت `panel`. */
  onClose?: () => void;
}

export const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'انتخاب تاریخ شمسی...',
  className = '',
  required = false,
  portal = false,
  variant = 'field',
  onClose
}) => {
  const panelOnly = variant === 'panel';
  const [isOpen, setIsOpen] = useState(panelOnly);
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarPosition, setCalendarPosition] = useState<React.CSSProperties>({ top: 8, left: 8 });

  const initialJalali = parseToJalali(value);
  const [viewYear, setViewYear] = useState<number>(initialJalali.jy);
  const [viewMonth, setViewMonth] = useState<number>(initialJalali.jm);

  useEffect(() => {
    if (value) {
      const parsed = parseToJalali(value);
      setViewYear(parsed.jy);
      setViewMonth(parsed.jm);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !calendarRef.current?.contains(target)) {
        setIsOpen(false);
        // در حالت `panel` والد باید بداند پنل بسته شد؛ وگرنه کادر تقویم
        // پنهان می‌شود ولی پوششِ کلیک بیرون روی صفحه می‌ماند.
        if (panelOnly) onClose?.();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, panelOnly, onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !portal) return;

    const updatePosition = () => {
      const trigger = containerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(288, window.innerWidth - 16);
      const height = calendarRef.current?.offsetHeight || 390;
      const spaceBelow = window.innerHeight - trigger.bottom;
      const spaceAbove = trigger.top;
      const top = spaceBelow >= height + 8 || spaceBelow >= spaceAbove
        ? Math.min(trigger.bottom + 8, window.innerHeight - height - 8)
        : Math.max(8, trigger.top - height - 8);
      const left = Math.max(8, Math.min(trigger.right - width, window.innerWidth - width - 8));
      setCalendarPosition({ top, left, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, portal]);

  const daysInMonth = getDaysInJalaliMonth(viewYear, viewMonth);
  
  // Calculate first day of the week for this month
  // Jalali month start day of week (0: Sunday, 1: Monday, ... 6: Saturday)
  const { gy, gm, gd } = jalaliToGregorian(viewYear, viewMonth, 1);
  const firstDayGregorian = new Date(gy, gm - 1, gd);
  // Saturday in JS is 6, Sunday is 0, Monday is 1, Tuesday is 2, Wednesday is 3, Thursday is 4, Friday is 5
  // In Persian calendar, week starts on Saturday (شنبه). Let's convert: Saturday -> 0, Sunday -> 1, ... Friday -> 6
  const jsDay = firstDayGregorian.getDay();
  const persianDayOffset = (jsDay + 1) % 7; // Saturday(6) -> 0, Sunday(0) -> 1, ... Friday(5) -> 6

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  

  

  

  
  const emitGregorian = (jy: number, jm: number, jd: number) => {
    const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
    const gmStr = gm < 10 ? `0${gm}` : `${gm}`;
    const gdStr = gd < 10 ? `0${gd}` : `${gd}`;
    onChange(`${gy}-${gmStr}-${gdStr}`);
  };

  const handleSelectDay = (day: number) => {
    emitGregorian(viewYear, viewMonth, day);
    setIsOpen(false);
    onClose?.();
  };

  const handleSelectToday = () => {
    const today = parseToJalali(new Date());
    emitGregorian(today.jy, today.jm, today.jd);
    setIsOpen(false);
    onClose?.();
  };

  const handleSelectNextWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const j = parseToJalali(nextWeek);
    emitGregorian(j.jy, j.jm, j.jd);
    setIsOpen(false);
    onClose?.();
  };

  const handleSelectNextMonth = () => {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const j = parseToJalali(nextMonth);
    emitGregorian(j.jy, j.jm, j.jd);
    setIsOpen(false);
    onClose?.();
  };


  const currentSelectedJalali = value ? parseToJalali(value) : null;
  // «امروز» مبنای نشانه‌گذاری روز جاری در تقویم است.
  const todayJalali = parseToJalali(new Date());

  const calendarPanel = isOpen ? (
    <div
      ref={calendarRef}
      style={portal ? calendarPosition : undefined}
      className={`${panelOnly ? 'relative' : portal ? 'fixed z-[100] max-h-[calc(100vh-1rem)] overflow-y-auto' : 'absolute z-50 mt-2 right-0'} w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-3.5 animate-in fade-in zoom-in-95 duration-150`}
    >
          {/* Header Navigation */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1">
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden"
              >
                {[1402, 1403, 1404, 1405, 1406, 1407, 1408].map(yr => (
                  <option key={yr} value={yr}>
                    {toPersianDigits(yr)}
                  </option>
                ))}
              </select>

              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden"
              >
                {PERSIAN_MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="ماه قبل"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="ماه بعد"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-bold text-slate-400">
            {/* Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday, Friday */}
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((day, i) => (
              <div key={i} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {/* Empty slots before first day */}
            {Array.from({ length: persianDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="p-1.5" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                currentSelectedJalali &&
                currentSelectedJalali.jy === viewYear &&
                currentSelectedJalali.jm === viewMonth &&
                currentSelectedJalali.jd === day;
              // «امروز» با یک حاشیهٔ کم‌رنگ به رنگ اصلی سامانه مشخص می‌شود و
              // رنگ روز انتخاب‌شده را نمی‌گیرد؛ بنابراین هر دو حالت هم‌زمان
              // خوانا می‌مانند.
              const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  aria-current={isToday ? 'date' : undefined}
                  title={isToday ? 'امروز' : undefined}
                  // «امروز» با حاشیهٔ کم‌رنگِ رنگ اصلی سامانه نشان داده می‌شود؛
                  // رنگ از توکن گرفته می‌شود تا با هر پالت سازمانی هم‌خوان باشد.
                  style={isToday && !isSelected ? {
                    borderColor: 'color-mix(in srgb, var(--color-primary) 38%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 7%, transparent)',
                    color: 'var(--color-primary)',
                  } : undefined}
                  className={`p-1.5 rounded-xl font-bold transition-colors cursor-pointer text-center border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : isToday
                        ? 'hover:bg-indigo-50'
                        : 'border-transparent text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>

          {/* Quick Action Shortcuts */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={handleSelectToday}
              className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={handleSelectNextWeek}
              className="font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              +۱ هفته
            </button>
            <button
              type="button"
              onClick={handleSelectNextMonth}
              className="font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              +۱ ماه
            </button>
          </div>
        </div>
  ) : null;

  /**
   * حالت `panel`: تقویم همان لحظه باز و بدون فیلد ورودی نمایش داده می‌شود؛
   * انتخاب روز یا کلیک بیرون، پنل را با `onClose` به والد می‌بندد.
   */
  if (panelOnly) {
    return (
      <div className={`relative ${className}`} ref={containerRef} dir="rtl">
        {label && (
          <label className="mb-1.5 block text-xs font-bold text-slate-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}
        {calendarPanel}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={containerRef} dir="rtl">
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[var(--control-height)] min-h-[var(--control-height)] flex items-center justify-between px-3.5 py-0 bg-slate-50 hover:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs text-right transition-colors cursor-pointer shadow-2xs"
      >
        <span className={value ? 'font-bold text-slate-900' : 'text-slate-400'}>
          {value ? formatToJalaliLong(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
      </button>

      {calendarPanel && (portal ? createPortal(calendarPanel, document.body) : calendarPanel)}
    </div>
  );
};
