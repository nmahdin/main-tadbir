import type { DeadlineTier } from './date';

/**
 * رنگ‌های «مهلت» در همهٔ صفحه‌ها یک منبع دارد.
 *
 * قاعده ثابت سامانه است: مهلت گذشته → بنفش ملایم، مهلت امروز → قرمز ملایم، یک روز
 * مانده → کهربایی ملایم، بیش از یک روز → خاکستری آرام. کارت مرحلهٔ محتوا و کادر
 * «مهلت انجام» وظیفه هر دو از همین کلاس‌ها می‌آیند تا یک مهلت در دو صفحه دو رنگ
 * نباشد. رنگ از تاریخ واقعی محاسبه می‌شود و هیچ‌گاه مقدار ذخیره‌شده را تغییر نمی‌دهد.
 */
export type DeadlineToneTier = DeadlineTier;

export const DEADLINE_CHIP_TONES: Record<DeadlineToneTier, string> = {
  past: 'border-violet-200 bg-violet-50 text-violet-700',
  today: 'border-rose-200 bg-rose-50 text-rose-700',
  soon: 'border-amber-200 bg-amber-50 text-amber-800',
  later: 'border-slate-200 bg-slate-50 text-slate-500',
  unknown: 'border-slate-200 bg-slate-50 text-slate-500',
};

export const DEADLINE_ICON_TONES: Record<DeadlineToneTier, string> = {
  past: 'text-violet-500',
  today: 'text-rose-500',
  soon: 'text-amber-500',
  later: 'text-slate-400',
  unknown: 'text-slate-400',
};

/** ردهٔ خنثی برای موردی که مهلتش تعیین تکلیف شده است (تکمیل/آرشیو/لغو). */
export const DEADLINE_SETTLED_TONE: DeadlineToneTier = 'later';

/**
 * ردهٔ رنگی یک مهلت. مهلت‌های «تعیین‌تکلیف‌شده» همیشه خنثی‌اند تا کار تمام‌شده
 * هشدار بی‌دلیل نگیرد.
 */
export const deadlineToneTier = (tier?: DeadlineTier | null, settled = false): DeadlineToneTier =>
  settled ? DEADLINE_SETTLED_TONE : (tier ?? 'unknown');
