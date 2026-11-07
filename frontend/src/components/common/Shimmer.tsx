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

/** ردیف‌های فهرست با آیکون/آواتار کنار و دو خط متن؛ برای اعلان‌ها و فهرست‌های ساده. */
export const ListRowsSkeleton: React.FC<{ rows?: number; label?: string; className?: string }> = ({
  rows = 5,
  label = 'در حال دریافت موارد…',
  className = 'divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white',
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className={className}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3.5 p-4 sm:p-5">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonText index={index} className="h-3.5" />
                <SkeletonBlock className="h-2.5 w-20" />
              </div>
              <SkeletonBlock className="h-2.5 w-16 shrink-0" />
            </div>
            <SkeletonBlock className="h-2.5 w-full" />
            <SkeletonBlock className="h-2.5 w-3/4" />
            <div className="flex gap-2 pt-1">
              <SkeletonChip className="h-5 w-24" />
              <SkeletonChip className="h-5 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** کارت‌های «نیازمند بررسی»: نشانهٔ رنگی کنار، عنوان، مرحله و خط مهلت. */
export const ApprovalCardsSkeleton: React.FC<{ count?: number; label?: string }> = ({
  count = 4,
  label = 'در حال دریافت موارد نیازمند بررسی…',
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="ui-shimmer absolute inset-y-0 right-0 w-1" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonChip className="h-6 w-24" />
              <SkeletonText index={index} className="h-3.5" />
              <SkeletonBlock className="h-2.5 w-32" />
            </div>
            <SkeletonBlock className="h-5 w-5 shrink-0 rounded-md" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <SkeletonBlock className="h-2.5 w-28" />
            <SkeletonChip className="h-7 w-20" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** صفحهٔ گزارش: کارت‌های آماری + دو نمودار + جدول. */
export const ReportSkeleton: React.FC<{ label?: string }> = ({ label = 'در حال محاسبه گزارش…' }) => (
  <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-5">
      <div className="space-y-3">
        <SkeletonBlock className="h-5 w-56" />
        <SkeletonBlock className="h-3 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-9 w-9 rounded-xl" />
              <SkeletonChip className="h-5 w-14" />
            </div>
            <SkeletonBlock className="h-6 w-16" />
            <SkeletonText index={index} className="h-2.5" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
            <SkeletonBlock className="h-3.5 w-40" />
            <div className="flex h-48 items-end gap-2">
              {[62, 84, 46, 96, 70, 88, 54].map((height, bar) => (
                <SkeletonBlock key={bar} className="flex-1 rounded-t-lg" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <SkeletonBlock className="h-2.5 w-32" />
            <SkeletonBlock className="h-2 flex-1 rounded-full" />
            <SkeletonBlock className="h-2.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * صفحهٔ جزئیات: سربرگ (دکمهٔ بازگشت + عنوان + نشانگرها)، نوار تب و بدنهٔ پنل.
 * جای چرخندهٔ وسط‌چینِ «در حال بارگذاری پرونده…» می‌نشیند تا با رسیدن داده
 * صفحه از همان قالب شروع شود و نپرد.
 */
export const DetailPageSkeleton: React.FC<{ label?: string; tabs?: number }> = ({
  label = 'در حال بارگذاری…',
  tabs = 4,
}) => (
  <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-6">
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-9 w-9 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/3" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonChip className="w-24" />
          <SkeletonChip className="w-20" />
          <SkeletonChip className="w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <SkeletonBlock className="h-2.5 w-16" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
        {Array.from({ length: tabs }).map((_, index) => (
          <SkeletonBlock key={index} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
        <SkeletonBlock className="h-4 w-48" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-6 rounded-lg" />
              <SkeletonBlock className="h-3 w-40" />
              <SkeletonChip className="mr-auto h-5 w-20" />
            </div>
            <SkeletonText index={index} />
            <SkeletonBlock className="h-2.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * اسکلت تقویم (دور ۱۰۰): همان نوار ابزار بازه، همان نوار هفت‌روزهٔ روزهای هفته و
 * همان شبکهٔ هفت‌ستونی تقویم ماهانه — با همان `gap-1.5`، همان سلول‌های
 * `rounded-2xl` و همان ارتفاع، تا با آمدن دادهٔ واقعی هیچ روزی جابه‌جا نشود.
 */
export const CalendarSkeleton: React.FC<{ label?: string; weeks?: number; className?: string }> = ({
  label = 'در حال آماده‌سازی تقویم…',
  weeks = 5,
  className = '',
}) => (
  <div role="status" aria-live="polite" aria-busy="true" className={`space-y-2 ${className}`}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SkeletonBlock className="h-8 w-8 rounded-xl" />
          <SkeletonBlock className="h-8 w-24 rounded-xl" />
          <SkeletonBlock className="h-8 w-8 rounded-xl" />
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-7 w-14 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].map(day => (
          <div key={day} className="truncate py-1 text-center text-[10px] font-bold text-slate-400 sm:text-xs">{day}</div>
        ))}
      </div>
      {/* همان پوشش اسکرول افقی تقویم واقعی؛ روی موبایل شبکه فشرده نمی‌شود. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="grid min-w-[52rem] grid-cols-7 gap-1.5">
        {Array.from({ length: weeks * 7 }).map((_, index) => (
          <div key={index} className="flex min-h-[128px] flex-col rounded-2xl bg-white p-2 ring-1 ring-inset ring-slate-100 sm:min-h-[156px]">
            <SkeletonBlock className="h-5 w-7 rounded-lg" />
            <div className="mt-1.5 min-w-0 flex-1 space-y-1">
              {/* الگوی رویدادها پایدار است (بر اساس اندیس، نه تصادفی). */}
              {index % 3 === 0 && <SkeletonBlock className="h-4 w-full rounded-md" />}
              {index % 4 === 1 && <SkeletonBlock className="h-4 w-4/5 rounded-md" />}
              {index % 5 === 2 && <SkeletonBlock className="h-4 w-3/5 rounded-md" />}
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  </div>
);
