import React from 'react';

/**
 * اسکلت‌های هم‌شکل با محتوا (دور ۹۷).
 *
 * پیش‌تر فهرست‌ها و جدول‌ها هنگام بارگذاری یک چرخندهٔ وسط‌چین نشان می‌دادند؛ با
 * رسیدن داده کل چیدمان یک‌باره ساخته می‌شد و صفحه «می‌پرید». اینجا همان قالب
 * واقعی (همان تعداد ستون، همان ارتفاع ردیف، همان جای نشانگر و آواتار) با
 * بلوک‌های شامِر کشیده می‌شود و با آمدن داده، محتوا روی آن محو می‌شود. نتیجه:
 * جهش چیدمان صفر و حس سرعت بیشتر از سرعت واقعی.
 *
 * همهٔ بلوک‌ها `aria-hidden` هستند و ظرف بیرونی `role="status"` با یک متن
 * خوانده‌شدنی برای صفحه‌خوان دارد.
 */

const SHIMMER_BASE = 'ui-shimmer rounded-md';

export const SkeletonBlock: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <span aria-hidden="true" className={`${SHIMMER_BASE} block ${className}`} style={style} />
);

/** تک بلوک متنی با عرض تصادفیِ پایدار (بر اساس اندیس، نه random تا در رندر بعدی نپرد). */
const textWidth = (index: number) => `${[92, 78, 86, 68, 74, 88][index % 6]}%`;

export const SkeletonText: React.FC<{ index?: number; className?: string }> = ({ index = 0, className = '' }) => (
  <SkeletonBlock className={`h-3 ${className}`} style={{ width: textWidth(index) }} />
);

/** چیپ گرد (نشانگر وضعیت، اولویت، شمارنده). */
export const SkeletonChip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <SkeletonBlock className={`h-6 w-20 rounded-full ${className}`} />
);

/**
 * اسکلت جدول فهرست: دقیقاً همان سرستون‌ها و همان ارتفاع ردیف‌های واقعی
 * (`p-4`، ستون عنوان پهن‌تر، ستون عملیات باریک).
 */
export const TableSkeleton: React.FC<{
  rows?: number;
  /** برچسب سرستون‌های واقعی؛ خالی بماند، سرستون ساخته نمی‌شود. */
  columns?: string[];
  label?: string;
}> = ({ rows = 6, columns = [], label = 'در حال دریافت فهرست از سرور…' }) => (
  <div role="status" aria-live="polite" aria-busy="true" className="w-full">
    <span className="sr-only">{label}</span>
    <table className="w-full text-right text-sm" aria-hidden="true">
      {columns.length > 0 && (
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-400">
            {columns.map((column, index) => <th key={`${column}-${index}`} className="p-4 font-bold">{column}</th>)}
          </tr>
        </thead>
      )}
      <tbody className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, row) => (
          <tr key={row}>
            <td className="max-w-sm p-4">
              <div className="space-y-2">
                <SkeletonText index={row} className="h-3.5" />
                <SkeletonText index={row + 3} className="h-2.5" />
              </div>
            </td>
            {Array.from({ length: Math.max(columns.length - 2, 3) }).map((__, cell) => (
              <td key={cell} className="p-4">
                {cell === 0 ? <SkeletonChip /> : <SkeletonBlock className="h-3 w-16" />}
              </td>
            ))}
            <td className="p-4">
              <div className="flex items-center justify-end gap-1.5">
                <SkeletonBlock className="h-7 w-7 rounded-xl" />
                <SkeletonBlock className="h-7 w-7 rounded-xl" />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** اسکلت کارت‌های فهرست (کارت‌های همان اندازه و همان ترتیب بخش‌ها). */
export const CardGridSkeleton: React.FC<{ count?: number; className?: string; label?: string }> = ({
  count = 6,
  className = 'grid gap-4 p-4 sm:p-5 sm:grid-cols-2 lg:grid-cols-3',
  label = 'در حال دریافت موارد…',
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white p-5">
          <span className="ui-shimmer absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
          <div className="space-y-4 pt-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonText index={index} className="h-3.5" />
                <SkeletonText index={index + 2} className="h-2.5" />
              </div>
              <SkeletonChip className="shrink-0" />
            </div>
            <div className="space-y-2">
              <SkeletonBlock className="h-2.5 w-full" />
              <SkeletonBlock className="h-2.5 w-4/5" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonChip className="w-16" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-7 w-7 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** اسکلت ستون‌های کانبان (تیتر ستون + دو کارت). */
export const BoardSkeleton: React.FC<{ columns?: number; label?: string }> = ({ columns = 4, label = 'در حال دریافت تخته…' }) => (
  <div role="status" aria-live="polite" aria-busy="true" className="p-4">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="flex items-start gap-4 overflow-hidden">
      {Array.from({ length: columns }).map((_, column) => (
        <div key={column} className="w-72 shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-5 w-6 rounded-full" />
          </div>
          {Array.from({ length: 2 }).map((__, card) => (
            <div key={card} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <SkeletonText index={card + column} />
              <SkeletonBlock className="h-2.5 w-2/3" />
              <div className="flex items-center justify-between pt-1">
                <SkeletonChip className="h-5 w-16" />
                <SkeletonBlock className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** اسکلت شبکهٔ دارایی‌ها (DAM): کاشی تصویر + دو خط متن. */
export const TileGridSkeleton: React.FC<{ count?: number; className?: string; label?: string }> = ({
  count = 12,
  className = 'grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  label = 'در حال دریافت دارایی‌ها…',
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
          <SkeletonBlock className="aspect-4/3 w-full rounded-xl" />
          <SkeletonText index={index} />
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-2.5 w-16" />
            <SkeletonChip className="h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** اسکلت کارت‌های آماری داشبورد، هم‌اندازهٔ کارت واقعیِ `p-5`. */
export const StatCardsSkeleton: React.FC<{ count?: number; className?: string; label?: string }> = ({
  count = 4,
  className = 'grid grid-cols-2 gap-4 md:grid-cols-4',
  label = 'در حال دریافت آمار…',
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-2 flex items-start justify-between">
            <SkeletonBlock className="h-10 w-10 rounded-xl" />
            <SkeletonBlock className="h-6 w-10" />
          </div>
          <SkeletonText index={index} className="h-3.5" />
          <SkeletonBlock className="mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  </div>
);
