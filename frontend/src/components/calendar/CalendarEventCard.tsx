import React from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { CalendarEventKindIcon, type CalendarEventKind } from './CalendarKindIcon';
import { CALENDAR_DUE_CARD, CALENDAR_DUE_DOT, CALENDAR_DUE_LABEL, type CalendarDueTone } from '../../utils/calendarTone';

/**
 * کارت مشترک رویداد تقویم — یک ظاهر برای محتوا، تسک و پروژه در همهٔ تقویم‌ها.
 *
 * چرا کارت و نه چیپ کوچک: کاربر باید عنوان را کامل بخواند، وضعیت را رنگی ببیند و
 * از رنگ کارت به سررسید برسد. به همین دلیل عنوان با `truncate` بریده نمی‌شود و
 * کلاس‌های رنگ از `utils/calendarTone.ts` می‌آیند (یک منبع برای همهٔ نماها).
 */
export interface CalendarEventStatus {
  label: string;
  /** رنگ وضعیت از تنظیمات همان ماژول (تسک/محتوا/پروژه)؛ بدون رنگ، خاکستری می‌ماند. */
  color?: string | null;
}

export interface CalendarEventCardProps {
  kind: CalendarEventKind;
  title: string;
  /** ردهٔ رنگی بر پایهٔ تاریخ سررسید. */
  tone: CalendarDueTone;
  status?: CalendarEventStatus | null;
  /** ساعت رویداد؛ رشتهٔ خالی یعنی رویداد تمام‌روز. */
  timeLabel?: string;
  /** برچسب تاریخ سررسید یا متن «چند روز مانده». */
  dueLabel?: string;
  /** یک خط توضیح تکمیلی (نام پروژه، مجموعه، کانال‌ها…). */
  meta?: string;
  onOpen?: () => void;
  /** دکمه‌های کنار کارت؛ بیرون از ناحیهٔ کلیک کارت می‌نشینند تا دکمه در دکمه نباشد. */
  actions?: React.ReactNode;
  className?: string;
  /** برای تقویم مجموعه‌ها که رنگ از خود مجموعه می‌آید و نه از سررسید. */
  toneClassOverride?: string;
  compact?: boolean;
}

/** نشانگر رنگی وضعیت؛ رنگ از پیکربندی واقعی همان ماژول خوانده می‌شود. */
export const CalendarStatusPill: React.FC<{ status?: CalendarEventStatus | null }> = ({ status }) => {
  if (!status?.label) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(status.color || '')) ? String(status.color) : null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black leading-5"
      style={color ? { color, backgroundColor: `${color}16`, borderColor: `${color}55` } : undefined}
      title={`وضعیت: ${status.label}`}
      {...(color ? {} : { 'data-tone': 'neutral' })}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color || '#64748b' }} aria-hidden />
      <span className="whitespace-normal break-words text-right">{status.label}</span>
    </span>
  );
};

export const CalendarEventCard: React.FC<CalendarEventCardProps> = ({
  kind,
  title,
  tone,
  status,
  timeLabel = '',
  dueLabel = '',
  meta = '',
  onOpen,
  actions,
  className = '',
  toneClassOverride,
  compact = false,
}) => {
  const body = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-black text-slate-500">
          <CalendarEventKindIcon kind={kind} className="h-3.5 w-3.5" />
          <span className={`h-2 w-2 shrink-0 rounded-full ${CALENDAR_DUE_DOT[tone].split(' ')[0]}`} aria-hidden />
          <span className="whitespace-normal break-words">{CALENDAR_DUE_LABEL[tone]}</span>
        </span>
        <CalendarStatusPill status={status} />
      </span>
      <span className={`mt-1.5 block whitespace-normal break-words text-right font-black text-slate-900 ${compact ? 'text-[11px] leading-5' : 'text-[12px] leading-6 sm:text-[13px]'}`}>{title}</span>
      {(timeLabel || dueLabel || meta) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-600">
          {timeLabel && <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-1.5 py-0.5"><Clock3 className="h-3 w-3" />{timeLabel}</span>}
          {dueLabel && <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-1.5 py-0.5"><CalendarDays className="h-3 w-3" />{dueLabel}</span>}
          {meta && <span className="min-w-0 whitespace-normal break-words opacity-90">{meta}</span>}
        </span>
      )}
    </>
  );

  return (
    <article className={`w-full overflow-hidden rounded-2xl border-2 text-right transition-colors ${toneClassOverride || CALENDAR_DUE_CARD[tone]} ${className}`}>
      {onOpen
        ? <button type="button" onClick={onOpen} title={title} className={`block w-full text-right ${compact ? 'p-2' : 'p-2.5'}`}>{body}</button>
        : <div className={compact ? 'p-2' : 'p-2.5'} title={title}>{body}</div>}
      {actions && <div className="flex flex-wrap items-center justify-end gap-1 border-t border-black/5 bg-white/60 px-1.5 py-1">{actions}</div>}
    </article>
  );
};
