import React from 'react';
import { CalendarClock } from 'lucide-react';
import { formatPersianDate, formatPersianTime } from '../../utils/date';
import { PUBLICATION_TONE_CLASSES, isPublishedContent, publicationRemaining, type PublicationSchedule } from '../../utils/publicationTiming';

/**
 * نشان «تاریخ انتشار» با رنگ متن و زمینهٔ برآمده از فاصله تا موعد انتشار.
 *
 * تنها جای نمایش تاریخ انتشار در فهرست‌ها و میز انتشار است تا هم رنگ و هم متن
 * یکسان بماند: منتشرشده سبز، گذشته ملایم بنفش، امروز قرمز ملایم، یک روز مانده
 * کهربایی و دورتر خنثی. زیر تاریخ، فاصلهٔ واقعی («۳ روز و ۵ ساعت مانده») می‌آید و
 * اگر تاریخی ثبت نشده باشد صریحاً «انتشار تعیین نشده» نوشته می‌شود؛ هیچ تاریخ یا
 * ساعتی جعل نمی‌شود.
 */
export const PublicationDateChip: React.FC<{
  content: { status?: string | null; publishInfo?: PublicationSchedule | null };
  className?: string;
}> = ({ content, className = '' }) => {
  const remaining = publicationRemaining(content.publishInfo, { published: isPublishedContent(content) });
  if (!remaining) return <span className={`text-[11px] font-bold text-slate-400 ${className}`}>انتشار تعیین نشده</span>;

  return (
    <span
      className={`inline-flex w-max max-w-full flex-col gap-0.5 rounded-xl border px-2.5 py-1.5 ${PUBLICATION_TONE_CLASSES[remaining.tone]} ${className}`}
      title={`تاریخ انتشار ثبت‌شده: ${formatPersianDate(content.publishInfo?.date || undefined)}`}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-black">
        <CalendarClock className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap font-sans">{formatPersianDate(content.publishInfo?.date || undefined)}</span>
        {content.publishInfo?.time && <span className="whitespace-nowrap font-sans opacity-80">· {formatPersianTime(content.publishInfo.time)}</span>}
      </span>
      <span className="text-[10px] font-bold opacity-90">{remaining.label}</span>
    </span>
  );
};
