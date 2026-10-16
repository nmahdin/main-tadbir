import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CalendarEventKindIcon } from '../calendar/CalendarKindIcon';
import { Content } from '../../types';
import {
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';

interface PublishingCalendarProps {
  onSelectContent: (contentId: string) => void;
  onScheduleContent: (content: Content) => void;
}

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  onSelectContent,
  onScheduleContent,
}) => {
  const { contents } = useApp();
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');

  // تاریخ انتشار هر محتوا با تاریخ تقویمی روز تطبیق داده می‌شود تا اختلاف منطقهٔ
  // زمانی، پست را به روز کناری نبرد.
  const publishedContentsOn = (iso: string) => contents.filter(content => String(content.publishInfo?.date || '').slice(0, 10) === iso);
  const days = buildCalendarDays(anchor, rangeMode);
  const rangeLabel = calendarRangeLabel(anchor, rangeMode);
  const scheduledInRange = days.reduce((total, day) => total + publishedContentsOn(day.iso).length, 0);

  const contentChip = (content: Content) => {
    const isPublished = content.publishInfo?.status === 'published';
    return (
      <span
        key={content.id}
        className={`flex w-full min-w-0 items-center justify-between gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-bold ${
          isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectContent(content.id)}
          title={`${content.title} (${content.publishInfo?.time || 'بدون ساعت'})`}
          className="flex min-w-0 flex-1 items-center gap-1 text-right"
        >
          <CalendarEventKindIcon kind={isPublished ? 'publish' : 'content'} />
          <span className="truncate">{content.title}</span>
        </button>
        {content.publishInfo?.time && <span className="shrink-0 font-mono text-[9px] opacity-75">{content.publishInfo.time}</span>}
        {!isPublished && (
          <button
            type="button"
            onClick={() => onScheduleContent(content)}
            title="زمان‌بندی و ویرایش برنامهٔ انتشار"
            className="shrink-0 rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-indigo-700"
          >
            زمان‌بندی
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <CalendarRangeToolbar
        mode={rangeMode}
        onModeChange={setRangeMode}
        label={rangeLabel}
        title="تقویم انتشار محتوا (شمسی)"
        hint={`${scheduledInRange.toLocaleString('fa-IR')} محتوا در این بازه`}
        onShift={direction => setAnchor(previous => shiftCalendarAnchor(previous, rangeMode, direction))}
        onToday={() => setAnchor(new Date())}
      />
      <CalendarGrid
        days={days}
        mode={rangeMode}
        eventCount={day => publishedContentsOn(day.iso).length}
        renderEvents={day => publishedContentsOn(day.iso).map(contentChip)}
        emptyDayLabel="محتوایی برای انتشار در این روز زمان‌بندی نشده است."
      />
    </div>
  );
};
