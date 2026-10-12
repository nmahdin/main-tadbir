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
