import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Content } from '../../types';
import { parseToJalali, jalaliToGregorian, getDaysInJalaliMonth, PERSIAN_MONTH_NAMES, toPersianDigits } from '../../utils/jalali';
import { 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft, 
  Clock, 
  Globe, 
  Eye, 
  Send, 
  Zap, 
  Plus, 
  CheckCircle2,
  Share2,
  Sparkles
} from 'lucide-react';

interface PublishingCalendarProps {
  onSelectContent: (contentId: string) => void;
  onScheduleContent: (content: Content) => void;
}

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  onSelectContent,
  onScheduleContent
}) => {
  const { contents, publishingPlatforms, publishContentNow } = useApp();

  const [currentDate, setCurrentDate] = useState(new Date());

  // Jalali / Persian Month formatter
  const persianMonthFormatter = new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric' });
  const persianDayFormatter = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' });
  const persianWeekdayFormatter = new Intl.DateTimeFormat('fa-IR', { weekday: 'short' });

  
  const jToday = parseToJalali(new Date());
  const jCurrent = parseToJalali(currentDate);
  const jy = jCurrent.jy;
  const jm = jCurrent.jm;
  
  const currentMonthLabel = `${PERSIAN_MONTH_NAMES[jm - 1]} ${toPersianDigits(jy)}`;
  
  const daysInMonth = getDaysInJalaliMonth(jy, jm);
  const { gy: gy1, gm: gm1, gd: gd1 } = jalaliToGregorian(jy, jm, 1);
  const firstDayObj = new Date(gy1, gm1 - 1, gd1);
  const startDayGregorian = firstDayObj.getDay(); // 0 (Sun) to 6 (Sat)
  const iranOffset = (startDayGregorian + 1) % 7; // Sat = 0, Sun = 1, ... Fri = 6

  const calendarCells: {
    dateObj: Date;
    dateStr: string;
    dayNumber: number;
    persianDay: string;
    isCurrentMonth: boolean;
    contents: Content[];
    isToday: boolean;
  }[] = [];
  
  const totalCells = Math.ceil((daysInMonth + iranOffset) / 7) * 7;
  
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - iranOffset + 1;
    let cellJy = jy;
    let cellJm = jm;
    let cellJd = dayNumber;
    let isCurrentMonth = true;
    
    if (dayNumber < 1) {
      isCurrentMonth = false;
      if (jm === 1) {
        cellJy = jy - 1;
        cellJm = 12;
      } else {
        cellJm = jm - 1;
      }
      cellJd = getDaysInJalaliMonth(cellJy, cellJm) + dayNumber;
    } else if (dayNumber > daysInMonth) {
      isCurrentMonth = false;
      if (jm === 12) {
        cellJy = jy + 1;
        cellJm = 1;
      } else {
        cellJm = jm + 1;
      }
      cellJd = dayNumber - daysInMonth;
    }
    
    const { gy: cellGy, gm: cellGm, gd: cellGd } = jalaliToGregorian(cellJy, cellJm, cellJd);
    const dateObj = new Date(cellGy, cellGm - 1, cellGd);
    // Add timezone offset to get correct ISO date string locally
    const dateStr = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    const dayContents = contents.filter(c => c.publishInfo?.date === dateStr);
    
    const isToday = cellJy === jToday.jy && cellJm === jToday.jm && cellJd === jToday.jd;
    
    calendarCells.push({
      dateObj,
      dateStr,
      dayNumber: cellJd,
      persianDay: toPersianDigits(cellJd),
      isCurrentMonth,
      contents: dayContents,
      isToday
    });
  }

  const handlePrevMonth = () => {
    let nextJm = jm - 1;
    let nextJy = jy;
    if (nextJm < 1) {
      nextJm = 12;
      nextJy -= 1;
    }
    const { gy, gm, gd } = jalaliToGregorian(nextJy, nextJm, 1);
    setCurrentDate(new Date(gy, gm - 1, gd));
  };

  const handleNextMonth = () => {
    let nextJm = jm + 1;
    let nextJy = jy;
    if (nextJm > 12) {
      nextJm = 1;
      nextJy += 1;
    }
    const { gy, gm, gd } = jalaliToGregorian(nextJy, nextJm, 1);
    setCurrentDate(new Date(gy, gm - 1, gd));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };
;

  const weekDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

  return (
    <div className="space-y-4 text-right" dir="rtl">
      {/* Calendar Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">تقویم ماهانه انتشار محتوا (شمسی)</h3>
            <p className="text-xs text-slate-500 font-bold">{currentMonthLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            امروز
          </button>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="ماه قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="ماه بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 pb-1">
        {weekDays.map((wd, i) => (
          <div key={i} className="py-1 bg-slate-100/70 rounded-lg">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar Grid Cells */}
      <div className="grid grid-cols-7 gap-2">
        {calendarCells.map((cell, idx) => (
          <div
            key={idx}
            className={`min-h-[110px] p-2 rounded-2xl border flex flex-col justify-between transition-all ${
              cell.isToday
                ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-200'
                : cell.isCurrentMonth
                ? 'bg-white border-slate-200 hover:border-indigo-200 shadow-2xs'
                : 'bg-slate-50/40 border-slate-100 opacity-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-md ${
                  cell.isToday
                    ? 'bg-indigo-600 text-white'
                    : cell.isCurrentMonth
                    ? 'text-slate-800'
                    : 'text-slate-400'
                }`}
              >
                {cell.persianDay}
              </span>

              {cell.contents.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-full">
                  {cell.contents.length} پست
                </span>
              )}
            </div>

            {/* Content Pills in Day Cell */}
            <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-hide flex-1">
              {cell.contents.map(c => {
                const isPublished = c.publishInfo?.status === 'published';
                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectContent(c.id)}
                    className={`p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all truncate flex items-center justify-between gap-1 ${
                      isPublished
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                    }`}
                    title={`${c.title} (${c.publishInfo?.time || '18:00'})`}
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="font-mono text-[9px] shrink-0 opacity-75">
                      {c.publishInfo?.time || '18:00'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
