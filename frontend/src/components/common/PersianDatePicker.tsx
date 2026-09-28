import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronRight, ChevronLeft, Check, Clock } from 'lucide-react';
import {
  parseToJalali,
  formatToJalaliLong,
  formatToJalaliNumber,
  formatToJalaliRaw,
  getDaysInJalaliMonth,
  PERSIAN_MONTH_NAMES,
  PERSIAN_DAY_NAMES_SHORT,
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
}

export const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'انتخاب تاریخ شمسی...',
  className = '',
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
  };

  const handleSelectToday = () => {
    const today = parseToJalali(new Date());
    emitGregorian(today.jy, today.jm, today.jd);
    setIsOpen(false);
  };

  const handleSelectNextWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const j = parseToJalali(nextWeek);
    emitGregorian(j.jy, j.jm, j.jd);
    setIsOpen(false);
  };

  const handleSelectNextMonth = () => {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const j = parseToJalali(nextMonth);
    emitGregorian(j.jy, j.jm, j.jd);
    setIsOpen(false);
  };


  const currentSelectedJalali = value ? parseToJalali(value) : null;

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
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs text-right transition-colors cursor-pointer shadow-2xs"
      >
        <span className={value ? 'font-bold text-slate-900' : 'text-slate-400'}>
          {value ? formatToJalaliLong(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 right-0 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-3.5 animate-in fade-in zoom-in-95 duration-150">
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

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`p-1.5 rounded-xl font-bold transition-colors cursor-pointer text-center ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
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
      )}
    </div>
  );
};
