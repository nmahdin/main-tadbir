import React from 'react';
import { ContentStatus } from '../types';
import { useApp } from '../context/AppContext';

/**
 * هندسهٔ یکسان نشانگرهای صفحهٔ جزئیات (وضعیت، مجموعه، دپارتمان) تا ارتفاع،
 * اندازهٔ متن و فاصلهٔ داخلی همه یکسان بماند. رنگ معنایی از داده می‌آید.
 */
export const DETAIL_BADGE_CLASS = 'inline-flex h-7 items-center gap-1 rounded-xl border px-3 text-[10px] font-bold leading-none whitespace-nowrap';

const TONES: Record<string, string> = {
  idea: 'border-slate-200 bg-slate-100 text-slate-700',
  planning: 'border-blue-200 bg-blue-50 text-blue-700',
  // «تأخیر» وضعیتی مشتق از مهلت واقعی مراحل است؛ رنگ بنفش ملایم آن با نشان
  // مهلت مرحله در صفحهٔ جزئیات هم‌راستا است.
  delayed: 'border-violet-200 bg-violet-50 text-violet-700',
  producing: 'border-amber-200 bg-amber-50 text-amber-700',
  reviewing: 'border-purple-200 bg-purple-50 text-purple-700',
  revising: 'border-rose-200 bg-rose-50 text-rose-700',
  // وضعیت بازنشستهٔ approving فقط برای نمایش صحیح دادهٔ قدیمی پیش از مایگریشن نگه داشته شده است.
  approving: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ready_to_publish: 'border-teal-200 bg-teal-50 text-teal-700',
  published: 'border-green-200 bg-green-50 text-green-700',
  suspended: 'border-orange-200 bg-orange-50 text-orange-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-500',
};

const LABELS: Record<string, string> = {
  idea: 'ایده اولیه',
  planning: 'برنامه‌ریزی',
  delayed: 'در تأخیر',
  producing: 'در حال تولید',
  reviewing: 'در انتظار بازبینی',
  revising: 'نیازمند اصلاح',
  approving: 'در انتظار بازبینی (وضعیت بازنشسته)',
  approved: 'تأییدشده',
  ready_to_publish: 'آماده انتشار',
  published: 'منتشرشده',
  suspended: 'تعلیق',
  cancelled: 'لغو شده',
  archived: 'آرشیو',
};

/** برچسب فارسی وضعیت برای فهرست‌هایی که از داده ساخته می‌شوند (بدون JSX). */
export const contentStatusLabel = (status: string): string => LABELS[status] || String(status);

/** رنگ نشانگر وضعیت برای نمودارها و تخته‌ها؛ مقدار نامشخص، خاکستری می‌ماند. */
export const contentStatusColor = (status: string): string => {
  const tone = TONES[status] || '';
  const match = tone.match(/bg-(\w+)-50/);
  return ({ slate: '#64748b', blue: '#3b82f6', amber: '#f59e0b', purple: '#a855f7', rose: '#f43f5e', violet: '#7c3aed', indigo: '#4f46e5', emerald: '#10b981', teal: '#14b8a6', green: '#22c55e', orange: '#f97316', red: '#ef4444' } as Record<string, string>)[match?.[1] || 'slate'] || '#64748b';
};

export type BadgeSize = 'sm' | 'md';

const sizeClass = (size: BadgeSize) => size === 'md' ? DETAIL_BADGE_CLASS : 'px-2 py-1 rounded-md text-[10px] border whitespace-nowrap overflow-hidden';

export const getContentStatusBadge = (status: ContentStatus, size: BadgeSize = 'sm') => {
  const tone = TONES[status] || 'border-slate-200 bg-slate-100 text-slate-700';
  const label = LABELS[status] || String(status);
  if (size === 'md') {
    return <span className={`${DETAIL_BADGE_CLASS} ${tone}`}>{label}</span>;
  }
  return <span className={`${sizeClass(size)} font-bold ${tone}`}>{label}</span>;
};

export const ContentStatusBadge: React.FC<{ status: ContentStatus; size?: BadgeSize; className?: string }> = ({ status, size = 'sm', className = '' }: { status: ContentStatus; size?: BadgeSize; className?: string }) => {
  let contentStatuses: { id: string; label: string; color: string }[] = [];
  try {
    contentStatuses = useApp().contentStatuses;
  } catch {
    contentStatuses = [];
  }
  const setting = contentStatuses.find(st => st.id === status);
  if (!setting) {
    const badge = getContentStatusBadge(status, size);
    return className ? <span className={`inline-flex ${className}`}>{badge}</span> : badge;
  }
  if (size === 'md') {
    return (
      <span
        className={`${DETAIL_BADGE_CLASS} ${className}`}
        style={{ backgroundColor: `${setting.color}14`, color: setting.color, borderColor: `${setting.color}40` }}
      >
        {setting.label}
      </span>
    );
  }
  return (
    <span
      className={`px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap font-bold ${className}`}
      style={{ backgroundColor: `${setting.color}14`, color: setting.color, borderColor: `${setting.color}40` }}
    >
      {setting.label}
    </span>
  );
};
