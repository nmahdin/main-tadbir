import React, { useState } from 'react';
import { User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatPersianTime } from '../../utils/date';
import { PUBLICATION_SURFACE_TONE_CLASSES, isPublishedContent, publicationRemaining, type PublicationTone } from '../../utils/publicationTiming';
import { sortCalendarEventsByTime, type CalendarDueTone } from '../../utils/calendarTone';
import { contentStatusColor, contentStatusLabel } from '../../utils/statusBadges';
import { CalendarEventCard, type CalendarEventStatus } from '../calendar/CalendarEventCard';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import {
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarDay,
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
  /** مالک پروندهٔ محتوا؛ برای نمایش «مسئول» در مدال روز. */
  ownerId?: string | null;
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

/** ردهٔ رنگی تقویم از همان ردهٔ زمان انتشار ساخته می‌شود تا دو معیار نداشته باشیم. */
const dueToneOfPublication = (tone?: PublicationTone): CalendarDueTone => {
  if (tone === 'published') return 'settled';
  if (tone === 'past' || tone === 'today' || tone === 'soon' || tone === 'later') return tone;
  return 'unknown';
};

export const PublishingCalendar: React.FC<PublishingCalendarProps> = ({
  contents,
  onSelectContent,
  onScheduleContent,
  title = 'تقویم انتشار محتوا (شمسی)',
}) => {
  const { users } = useApp();
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  // تاریخ انتشار هر محتوا با تاریخ تقویمی روز تطبیق داده می‌شود تا اختلاف منطقهٔ
  // زمانی، پست را به روز کناری نبرد.
  const publishedContentsOn = (iso: string) => contents.filter(content => String(content.publishInfo?.date || '').slice(0, 10) === iso);
  /** کارت‌های هر روز به ترتیب ساعت انتشار؛ محتوای بدون ساعت در پایان می‌ماند. */
  const contentsOfDay = (iso: string) => sortCalendarEventsByTime<PublicationCalendarEntry>(publishedContentsOn(iso), content => content.publishInfo?.time);
  const days = buildCalendarDays(anchor, rangeMode);
  const rangeLabel = calendarRangeLabel(anchor, rangeMode);
  const scheduledInRange = days.reduce((total, day) => total + publishedContentsOn(day.iso).length, 0);

  const statusOf = (content: PublicationCalendarEntry): CalendarEventStatus => {
    if (isPublishedContent(content)) return { label: 'منتشرشده', color: '#059669' };
    if (content.publishInfo?.status === 'scheduled' || content.publishInfo?.date) return { label: 'زمان‌بندی‌شده', color: '#4f46e5' };
    return { label: contentStatusLabel(String(content.status || '')), color: contentStatusColor(String(content.status || '')) };
  };

  const contentCard = (content: PublicationCalendarEntry, compact = false) => {
    const remaining = publicationRemaining(content.publishInfo, { published: isPublishedContent(content) });
    const dueTone = dueToneOfPublication(remaining?.tone);
    const published = remaining?.tone === 'published';
    return (
      <CalendarEventCard
        key={content.id}
        kind={published ? 'publish' : 'content'}
        title={content.title}
        tone={dueTone}
        toneClassOverride={PUBLICATION_SURFACE_TONE_CLASSES[remaining?.tone ?? 'unknown']}
        status={statusOf(content)}
        timeLabel={content.publishInfo?.time ? formatPersianTime(content.publishInfo.time) : 'بدون ساعت'}
        meta={content.publishInfo?.channels?.length ? `کانال: ${content.publishInfo.channels.join('، ')}` : undefined}
        compact={compact}
        onOpen={() => onSelectContent(content.id)}
        actions={!published && onScheduleContent
          ? <button type="button" onClick={() => onScheduleContent(content)} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700 hover:bg-indigo-50">زمان‌بندی</button>
          : undefined}
      />
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
        agendaHint="کارت‌های هر روز به ترتیب ساعت انتشار می‌آیند؛ رنگ کارت از نزدیکی تاریخ انتشار می‌آید."
        eventCount={day => publishedContentsOn(day.iso).length}
        onSelectDay={setSelectedDay}
        renderEvents={day => {
          const rows = contentsOfDay(day.iso);
          return <>{rows.map(content => contentCard(content))}</>;
        }}
        emptyDayLabel="محتوایی برای انتشار در این روز زمان‌بندی نشده است."
      />

      <CalendarDayModal
        day={selectedDay}
        count={selectedDay ? publishedContentsOn(selectedDay.iso).length : 0}
        onClose={() => setSelectedDay(null)}
        emptyText="برای این روز محتوایی زمان‌بندی نشده است."
        hint="تقویم انتشار"
      >
        {selectedDay && contentsOfDay(selectedDay.iso).map(content => {
          const owner = users.find(user => user.id === (content.publisherId || content.ownerId));
          return (
            <div key={content.id} className="space-y-1">
              {contentCard(content)}
              <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <User className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
                  مسئول: {owner ? `${owner.name} ${owner.family || ''}`.trim() : 'ثبت نشده'}
                </span>
                {content.publishInfo?.channels?.length ? <span>· کانال‌ها: {content.publishInfo.channels.join('، ')}</span> : null}
                {content.publishInfo?.caption ? <span className="w-full whitespace-normal break-words text-slate-600">توضیح انتشار: {content.publishInfo.caption}</span> : null}
              </div>
            </div>
          );
        })}
      </CalendarDayModal>
    </div>
  );
};
