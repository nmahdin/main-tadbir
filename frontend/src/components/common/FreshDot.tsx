import React from 'react';

/**
 * نقطهٔ «تازه» (دور ۹۹).
 *
 * ردیفی که از آخرین بازدید کاربر تغییر کرده، یک نقطهٔ آبی کوچک با هالهٔ نرم
 * می‌گیرد. نقطه تزئینی است ولی معنا دارد، پس هم `title` دارد و هم برای
 * صفحه‌خوان با `aria-label` معرفی می‌شود؛ خودِ متن `sr-only` هم برای مرورگرهایی
 * است که `aria-label` را روی عنصر خالی نمی‌خوانند.
 */
export const FreshDot: React.FC<{ label?: string; className?: string }> = ({
  label = 'از آخرین بازدید شما تغییر کرده است',
  className = '',
}) => (
  <span role="img" aria-label={label} title={label} className={`ui-fresh-dot shrink-0 ${className}`}>
    <span className="sr-only">{label}</span>
  </span>
);

/** همان نقطه، با متن «تازه» کنارش؛ برای سربرگ فهرست‌ها و کارت‌های بزرگ. */
export const FreshTag: React.FC<{ label?: string; className?: string }> = ({
  label = 'تازه',
  className = '',
}) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-black text-sky-700 ring-1 ring-sky-100 ${className}`}
    title="از آخرین بازدید شما تغییر کرده است"
  >
    <span aria-hidden="true" className="ui-fresh-dot" />
    {label}
  </span>
);
