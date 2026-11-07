import React from 'react';
import { Calendar } from 'lucide-react';
import { deadlineDaysLabel, deadlineState, formatPersianDate } from '../../utils/date';
import { DEADLINE_CHIP_TONES, DEADLINE_ICON_TONES, deadlineToneTier } from '../../utils/deadlineTones';

/**
 * نشان «سررسید» با رنگ بر پایهٔ زمان باقی‌مانده.
 *
 * قاعدهٔ رنگ همان قاعدهٔ مشترک سامانه است (`utils/deadlineTones.ts`): مهلت گذشته
 * بنفش، امروز قرمز، یک روز مانده کهربایی و دورتر خنثی. برای کار تمام‌شده
 * (`settled`) رنگ خنثی می‌شود تا هشدار بی‌دلیل نداشته باشیم. تاریخ ذخیره‌شده
 * هرگز تغییر نمی‌کند؛ فقط لایهٔ نمایش رنگ می‌گیرد.
 */
export const DeadlineChip: React.FC<{
  deadline?: string | Date | null;
  /** کار تکمیل/آرشیو/لغو شده است؛ رنگ خنثی می‌شود. */
  settled?: boolean;
  /** نمایش برچسب «چند روز مانده/گذشته». */
  showRemaining?: boolean;
  /** نام کلاس‌های تکمیلی برای فاصله یا اندازه. */
  className?: string;
  /** فقط آیکون و متن کوتاه‌تر برای کارت‌های کانبان. */
  compact?: boolean;
}> = ({ deadline, settled = false, showRemaining = true, className = '', compact = false }) => {
  if (!deadline) {
    return <span className={`inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 ${className}`}><Calendar className="h-3.5 w-3.5" />بدون سررسید</span>;
  }

  const state = deadlineState(deadline);
  const tier = deadlineToneTier(state.tier, settled);
  const remaining = settled || !showRemaining ? '' : deadlineDaysLabel(state);
  const dateLabel = formatPersianDate(deadline) || '—';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${DEADLINE_CHIP_TONES[tier]} ${className}`}
      title={remaining ? `${dateLabel} · ${remaining}` : dateLabel}
    >
      <Calendar aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${DEADLINE_ICON_TONES[tier]}`} />
      <span className="whitespace-nowrap">{dateLabel}</span>
      {remaining && !compact && <span className="whitespace-nowrap text-[10px] font-black opacity-80">· {remaining}</span>}
    </span>
  );
};
