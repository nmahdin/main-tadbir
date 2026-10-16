import React, { useState } from 'react';
import { CalendarEventKindIcon } from '../calendar/CalendarKindIcon';
import { formatPersianTime } from '../../utils/date';
import { PUBLICATION_TONE_CLASSES, isPublishedContent, publicationRemaining } from '../../utils/publicationTiming';
import {
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';

/**
 * حداقل میدان واقعی موردنیاز تقویم انتشار. فهرست محتوا، فهرست نمایشی و میز
 * انتشار هر سه همین ساختار را دارند و تقویم دادهٔ خودش را از بیرون می‌گیرد.
 */
export interface PublicationCalendarEntry {
  id: string;
  title: string;
  status?: string | null;
  stages?: Array<{ status?: string | null }>;
  publisherId?: string | null;
  publishInfo?: {
    date?: string | null;
    time?: string | null;
    status?: string | null;
    channels?: string[];
    caption?: string | null;
  } | null;
}

interface PublishingCalendarProps {
  /** فقط محتوای همان فهرست و پالایهٔ فعال؛ تقویم دادهٔ خودش را می‌سازد. */
  contents: PublicationCalendarEntry[];
  onSelectContent: (contentId: string) => void;
  /** اگر ارسال شود، دکمهٔ «زمان‌بندی» روی هر رویداد نمایش داده می‌شود. */
  onScheduleContent?: (content: PublicationCalendarEntry) => void;
  title?: string;
}

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  contents,
  onSelectContent,
  onScheduleContent,
  title = 'تقویم انتشار محتوا (شمسی)',
}) => {
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');

  // تاریخ انتشار هر محتوا با تاریخ تقویمی روز تطبیق داده می‌شود تا اختلاف منطقهٔ
  // زمانی، پست را به روز کناری نبرد.
  const publishedContentsOn = (iso: string) => contents.filter(content => String(content.publishInfo?.date || '').slice(0, 10) === iso);
  const days = buildCalendarDays(anchor, rangeMode);
  const rangeLabel = calendarRangeLabel(anchor, rangeMode);
  const scheduledInRange = days.reduce((total, day) => total + publishedContentsOn(day.iso).length, 0);

  const contentChip = (content: PublicationCalendarEntry) => {
    const remaining = publicationRemaining(content.publishInfo, { published: isPublishedContent(content) });
    const isPublished = remaining?.tone === 'published';
    return (
      <span
        key={content.id}
        className={`flex w-full min-w-0 items-center justify-between gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-bold ${PUBLICATION_TONE_CLASSES[remaining?.tone ?? 'unknown']}`}
      >
        <button
          type="button"
          onClick={() => onSelectContent(content.id)}
          title={`${content.title} (${content.publishInfo?.time ? `ساعت ${formatPersianTime(content.publishInfo.time)}` : 'بدون ساعت'})`}
          className="flex min-w-0 flex-1 items-center gap-1 text-right"
        >
          <CalendarEventKindIcon kind={isPublished ? 'publish' : 'content'} />
          <span className="truncate">{content.title}</span>
        </button>
        {content.publishInfo?.time && <span className="shrink-0 font-mono text-[9px] opacity-75">{formatPersianTime(content.publishInfo.time)}</span>}
        {!isPublished && onScheduleContent && (
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
        title={title}
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
