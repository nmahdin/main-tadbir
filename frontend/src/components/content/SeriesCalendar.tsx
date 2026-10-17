import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarDay,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';
import { formatPersianDate, formatPersianTime } from '../../utils/date';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import { sortCalendarEventsByTime } from '../../utils/calendarTone';
import {
  groupSeriesCalendarEntries,
  seriesCalendarSeriesRows,
  seriesCalendarTone,
  type SeriesCalendarEntry,
  type SeriesCalendarSeries,
} from '../../utils/seriesCalendar';

/**
 * تقویم بزرگ مجموعه‌های محتوا.
 *
 * همان تقویم مشترک سامانه (ماهانه/هفتگی/سه‌هفتگی) با خانه‌های درشت‌تر تا
 * «هر مجموعه در چه روزهایی است» در یک نگاه خوانده شود: هر مجموعه یک رنگ ثابت
 * دارد، رنگ‌ها در راهنمای بالای تقویم قابل خاموش‌روشن کردن‌اند و فهرست متنی
 * روزها هم زیر تقویم می‌آید. داده دست خود تقویم نیست؛ صفحهٔ مجموعه‌ها آن را از
 * دوره‌های محاسبه‌شدهٔ سرور و پرونده‌های محتوای موجود می‌سازد.
 */
export interface SeriesCalendarProps {
  entries: SeriesCalendarEntry[];
  /** ترتیب و رنگ مجموعه‌ها؛ همان ترتیب فهرست. */
  seriesOrder: SeriesCalendarSeries[];
  loading?: boolean;
  title?: string;
  hint?: string;
  emptyDayLabel?: string;
  onSelectEntry?: (entry: SeriesCalendarEntry) => void;
  /** در صورت ارسال، دکمهٔ «باز کردن مجموعه» در راهنما و فهرست روزها می‌آید. */
  onOpenSeries?: (seriesId: string) => void;
}

/** بیش از این تعداد چیپ، روز با دکمهٔ «بیشتر» باز می‌شود تا خانه‌ها درشت بمانند. */
const MAX_VISIBLE_CHIPS = 3;

const fa = (value: number | string) => Number(value).toLocaleString('fa-IR');

export const SeriesCalendar: React.FC<SeriesCalendarProps> = ({
  entries,
  seriesOrder,
  loading = false,
  title = 'تقویم مجموعه‌های محتوا (شمسی)',
  hint,
  emptyDayLabel = 'در این روز دوره‌ای برای مجموعه‌های نمایش‌داده‌شده نیست.',
  onSelectEntry,
  onOpenSeries,
}) => {
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const tonesOf = (seriesId: string) => seriesCalendarTone(seriesOrder.findIndex(item => item.id === seriesId));
  const hidden = new Set(hiddenSeries);
  const visibleEntries = entries.filter(entry => !hidden.has(entry.seriesId));
  const entriesByDay = groupSeriesCalendarEntries(visibleEntries);
  /** دوره‌های هر روز به ترتیب ساعت؛ دورهٔ بدون ساعت در پایان می‌ماند. */
  const entriesOfDay = (iso: string) => sortCalendarEventsByTime<SeriesCalendarEntry>(entriesByDay[iso] || [], entry => entry.time);
  const days = buildCalendarDays(anchor, rangeMode);
  const dayKeys = days.map(day => day.iso);
  // فهرست روزها برای همهٔ مجموعه‌ها ساخته می‌شود؛ خاموش‌کردن یک رنگ فقط نمایش آن را می‌بندد.
  const allRows = seriesCalendarSeriesRows(entries, seriesOrder, dayKeys);
  const rows = allRows.filter(row => !hidden.has(row.seriesId));
  const totalInRange = rows.reduce((total, row) => total + row.entries.length, 0);
  const createdInRange = rows.reduce((total, row) => total + row.entries.filter(entry => entry.state === 'created').length, 0);
  const toggleSeries = (seriesId: string) =>
    setHiddenSeries(previous => previous.includes(seriesId) ? previous.filter(id => id !== seriesId) : [...previous, seriesId]);
  const toggleDay = (day: string) =>
    setExpandedDays(previous => previous.includes(day) ? previous.filter(item => item !== day) : [...previous, day]);

  const entryChip = (entry: SeriesCalendarEntry) => {
    const tone = tonesOf(entry.seriesId);
    const meta = [
      entry.time ? `ساعت ${formatPersianTime(entry.time)}` : null,
      entry.deadline && entry.deadline !== entry.day ? `مهلت ${formatPersianDate(entry.deadline)}` : null,
    ].filter(Boolean).join(' · ');
    const className = `w-full rounded-xl border border-r-4 px-2.5 py-2 text-right ${tone.chip} ${tone.accent} ${entry.state === 'planned' ? 'border-dashed' : ''}`;
    const body = <>
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="whitespace-normal break-words text-[12px] font-black leading-6">{entry.seriesName}</span>
        {entry.sequence !== null && <span className="shrink-0 rounded-md bg-white/70 px-1 text-[10px] font-black">#{fa(entry.sequence)}</span>}
      </span>
      <span className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold">
        <span className="min-w-0 whitespace-normal break-words opacity-80">{meta || entry.periodLabel || 'دورهٔ مجموعه'}</span>
        <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-black">{entry.state === 'planned' ? 'پیش‌بینی' : 'ثبت‌شده'}</span>
      </span>
    </>;

    return onSelectEntry
      ? <button key={entry.key} type="button" title={entry.title} onClick={() => onSelectEntry(entry)} className={`${className} transition-colors hover:brightness-95`}>{body}</button>
      : <div key={entry.key} title={entry.title} className={className}>{body}</div>;
  };

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <CalendarRangeToolbar
        mode={rangeMode}
        onModeChange={setRangeMode}
        label={calendarRangeLabel(anchor, rangeMode)}
        title={title}
        hint={`${fa(totalInRange)} دوره در این بازه${hint ? ` · ${hint}` : ''}`}
        onShift={direction => setAnchor(previous => shiftCalendarAnchor(previous, rangeMode, direction))}
        onToday={() => setAnchor(new Date())}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-2.5">
        {seriesOrder.map(series => {
          const tone = tonesOf(series.id);
          const off = hidden.has(series.id);
          const count = allRows.find(row => row.seriesId === series.id)?.entries.length ?? 0;
          return (
            <span key={series.id} className={`flex min-w-0 items-center gap-1.5 rounded-xl border bg-white py-1 pl-1 pr-2 ${off ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => toggleSeries(series.id)}
                title={`${off ? 'نمایش' : 'پنهان‌کردن'} روزهای «${series.name}» در تقویم`}
                className={`flex min-w-0 items-center gap-1 text-[11px] font-black ${tone.label}`}
              >
                <span className="max-w-40 truncate">{series.name}</span>
                {off ? <EyeOff className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}
              </button>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[9px] font-black text-slate-600">{fa(count)}</span>
              {onOpenSeries && <button type="button" onClick={() => onOpenSeries(series.id)} className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[9px] font-black text-slate-600 hover:bg-slate-50">باز کردن</button>}
            </span>
          );
        })}
        {hiddenSeries.length > 0 && <button type="button" onClick={() => setHiddenSeries([])} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700">نمایش همه</button>}
        {!seriesOrder.length && <span className="text-[11px] text-slate-500">مجموعه‌ای برای نمایش نیست.</span>}
      </div>

      <p className="text-[11px] leading-6 text-slate-500">
        هر رنگ یک مجموعهٔ محتواست. حاشیهٔ <b className="text-slate-700">خط‌چین</b> یعنی دورهٔ محاسبه‌شدهٔ سرور و حاشیهٔ
        <b className="text-slate-700"> ممتد </b> یعنی پروندهٔ محتوای ثبت‌شده؛ رنگ‌ها با کلیک روی نام مجموعه در راهنما خاموش و روشن می‌شوند.
      </p>

      {loading
        ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500">در حال محاسبهٔ روزهای مجموعه‌ها…</p>
        : <CalendarGrid
            days={days}
            mode={rangeMode}
            size="large"
            eventCount={day => (entriesByDay[day.iso] || []).length}
            emptyDayLabel={emptyDayLabel}
            onSelectDay={setSelectedDay}
            agendaHint="در نمای هفتگی، دوره‌های هر روز به ترتیب ساعت زیر عنوان همان روز می‌آیند."
            renderEvents={day => {
              const dayEntries = entriesOfDay(day.iso);
              const expanded = expandedDays.includes(day.iso);
              const visible = expanded ? dayEntries : dayEntries.slice(0, MAX_VISIBLE_CHIPS);
              return <>
                {visible.map(entryChip)}
                {dayEntries.length > MAX_VISIBLE_CHIPS && (
                  <button
                    type="button"
                    onClick={() => toggleDay(day.iso)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                  >
                    {expanded ? 'بستن' : `${fa(dayEntries.length - MAX_VISIBLE_CHIPS)} دورهٔ دیگر`}
                  </button>
                )}
              </>;
            }}
          />}

      <CalendarDayModal
        day={selectedDay}
        count={selectedDay ? entriesOfDay(selectedDay.iso).length : 0}
        onClose={() => setSelectedDay(null)}
        emptyText={emptyDayLabel}
        hint="مجموعه‌های محتوا"
      >
        {selectedDay && entriesOfDay(selectedDay.iso).map(entry => <div key={`modal-${entry.key}`} className="space-y-1">
          {entryChip(entry)}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-bold text-slate-500">{entry.periodLabel || 'دورهٔ مجموعه'}{entry.contentId ? ' · پروندهٔ ثبت‌شده' : ' · دورهٔ محاسبه‌شده'}</span>
            {onOpenSeries && <button type="button" onClick={() => { setSelectedDay(null); onOpenSeries(entry.seriesId); }} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700 hover:bg-indigo-50">باز کردن مجموعه</button>}
          </div>
        </div>)}
      </CalendarDayModal>

      <section className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black text-slate-800 sm:text-sm">روزهای هر مجموعه در این بازه</h4>
          <p className="text-[10px] font-bold text-slate-500">{fa(totalInRange)} دوره · {fa(createdInRange)} پروندهٔ ثبت‌شده</p>
        </div>
        <ul className="space-y-2">
          {rows.map(row => {
            const tone = tonesOf(row.seriesId);
            return <li key={row.seriesId} className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                <span className="text-[11px] font-black text-slate-800">{row.seriesName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{fa(row.entries.length)} دوره</span>
                {onOpenSeries && <button type="button" onClick={() => onOpenSeries(row.seriesId)} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-600 hover:bg-slate-50">مشاهده مجموعه</button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.entries.map(entry => {
                  const label = `${formatPersianDate(entry.day)}${entry.sequence !== null ? ` · #${fa(entry.sequence)}` : ''}${entry.time ? ` · ${formatPersianTime(entry.time)}` : ''}`;
                  return onSelectEntry
                    ? <button key={entry.key} type="button" title={entry.title} onClick={() => onSelectEntry(entry)} className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors hover:brightness-95 ${tone.chip} ${entry.state === 'planned' ? 'border-dashed' : ''}`}>{label}</button>
                    : <span key={entry.key} title={entry.title} className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${tone.chip} ${entry.state === 'planned' ? 'border-dashed' : ''}`}>{label}</span>;
                })}
              </div>
            </li>;
          })}
          {!rows.length && <li className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center text-[11px] font-bold text-slate-500">در این بازه روزی برای مجموعه‌های نمایش‌داده‌شده ثبت یا محاسبه نشده است.</li>}
        </ul>
      </section>
    </div>
  );
};
