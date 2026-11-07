import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('دانلود کد هر صفحه اسکلت هم‌شکل خودش را نشان می‌دهد، نه چرخندهٔ تمام‌صفحه', async () => {
  const [app, fallbacks] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/routing/viewFallbacks.tsx'),
  ]);

  // مرز Suspense صفحه‌ها با اسکلت همان نما پر می‌شود.
  assert.match(app, /<React\.Suspense fallback=\{viewSkeleton\(activeView\)\}>/);
  assert.match(app, /import \{ viewSkeleton \} from '\.\/routing\/viewFallbacks';/);
  // بارگذاری اولیهٔ دادهٔ فضای کاری هم اسکلت می‌دهد، نه چرخندهٔ وسط‌چین.
  assert.match(app, /isWorkspaceLoading && !\[[^\]]*\]\.includes\(activeView\) \? viewSkeleton\(activeView\) : renderActiveView\(\)/);
  // چرخندهٔ تمام‌صفحه فقط برای بازخورد جابه‌جایی از سایدبار مانده است.
  assert.equal(app.match(/<WorkspaceLoader/g)?.length, 1);
  assert.match(app, /pendingSidebarView && <WorkspaceLoader label="در حال بارگذاری صفحه…" \/>/);
  // `LoadingState` تنها در گیت ورود (بررسی نشست) مانده است.
  assert.equal(app.match(/<LoadingState/g)?.length, 1);
  assert.match(app, /if \(isSessionLoading\) return <LoadingState label="در حال بررسی نشست…" \/>;/);

  // صفحهٔ جزئیات محتوا و تقویم، هر کدام قالب خودشان را دارند.
  assert.match(fallbacks, /case 'content-detail':\s*\n\s*return shell\(<DetailPageSkeleton label=\{CONTENT_DETAIL\} tabs=\{6\} \/>\);/);
  assert.match(fallbacks, /case 'calendar':\s*\n\s*return shell\(<CalendarSkeleton label=\{CALENDAR\} \/>\);/);
  // و هیچ شاخه‌ای چرخنده برنمی‌گرداند.
  assert.doesNotMatch(fallbacks, /<LoadingState|<InlineSpinner|<WorkspaceLoader|<SkeletonBlock/);
  // قالب‌ها با همان حاشیهٔ صفحه‌های واقعی می‌آیند تا محتوا نپرد.
  assert.match(fallbacks, /<div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" dir="rtl">\{children\}<\/div>/);
});

test('اسکلت تقویم همان شبکهٔ ماهانهٔ واقعی را می‌کشد', async () => {
  const [shimmer, calendar] = await Promise.all([
    source('../src/components/common/Shimmer.tsx'),
    source('../src/components/calendar/CalendarViews.tsx'),
  ]);

  assert.match(shimmer, /export const CalendarSkeleton: React\.FC<\{ label\?: string; weeks\?: number; className\?: string \}>/);
  assert.match(shimmer, /label = 'در حال آماده‌سازی تقویم…'/);

  // همان هفت‌ستون، همان فاصله و همان ارتفاع سلول تقویم واقعی.
  const block = shimmer.slice(shimmer.indexOf('CalendarSkeleton'));
  assert.match(block, /grid grid-cols-7 gap-1\.5/);
  // همان پوشش اسکرول افقی تقویم واقعی تا روی موبایل شبکه فشرده نشود.
  assert.match(block, /-mx-1 overflow-x-auto px-1 pb-1/);
  assert.match(block, /grid min-w-\[52rem\] grid-cols-7 gap-1\.5/);
  assert.match(block, /min-h-\[128px\]/);
  assert.match(block, /rounded-2xl bg-white p-2 ring-1 ring-inset ring-slate-100/);
  assert.equal(block.match(/grid-cols-7/g)?.length, 2);
  for (const weekday of ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']) {
    assert.ok(block.includes(weekday), weekday);
  }
  // همان روزهای هفتهٔ تقویم واقعی، نه فهرست دلخواه.
  assert.match(calendar, /export const CALENDAR_WEEKDAYS = \['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'\];/);

  // نقش دسترس‌پذیر و شمارش سلول‌ها بر پایهٔ تعداد هفته‌ها.
  assert.match(block, /role="status" aria-live="polite" aria-busy="true"/);
  assert.match(block, /Array\.from\(\{ length: weeks \* 7 \}\)/);
  assert.match(block, /<span className="sr-only">\{label\}<\/span>/);
});

test('تقویم‌های درون‌صفحه‌ای هم اسکلت می‌گیرند، نه متن «در حال …»', async () => {
  const [seriesCalendar, seriesView] = await Promise.all([
    source('../src/components/content/SeriesCalendar.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
  ]);

  assert.match(seriesCalendar, /import \{ CalendarSkeleton \} from '\.\.\/common\/Shimmer';/);
  assert.match(seriesCalendar, /<CalendarSkeleton label="در حال محاسبهٔ روزهای مجموعه‌ها…" \/>/);
  // جایگزینی، نه هم‌نشینی: متن قبلی حذف شد.
  assert.doesNotMatch(seriesCalendar, /در حال محاسبهٔ روزهای مجموعه‌ها…<\/p>/);
  assert.doesNotMatch(seriesCalendar, /border-dashed border-slate-200 p-6 text-center/);

  // تب «تقویم آینده» صفحهٔ مجموعهٔ محتوا هم اسکلت تقویم می‌دهد.
  assert.match(seriesView, /import \{ CalendarSkeleton, DetailPageSkeleton, ListRowsSkeleton \} from '\.\.\/common\/Shimmer';/);
  assert.match(seriesView, /\{schedule\.isLoading && <CalendarSkeleton label="در حال محاسبه تقویم…" \/>\}/);
});

test('صفحهٔ جزئیات محتوا هیچ حالت بارگذاری وسط‌چینی ندارد', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');

  assert.match(detail, /if \(contentFallbackLoading\) \{\s*\n\s*\/\/[^\n]*\n\s*return <div dir="rtl"><DetailPageSkeleton label="در حال بارگذاری پروندهٔ محتوا…" tabs=\{4\} \/><\/div>;/);
  // چرخندهٔ بزرگ وسط صفحه و متن خالی بارگذاری حذف شدند.
  assert.doesNotMatch(detail, /<InlineSpinner size="lg"/);
  assert.doesNotMatch(detail, /justify-center gap-3 py-20 text-slate-500/);
  // دو بلوک متنی «در حال دریافت …» هم به اسکلت ردیف تبدیل شدند.
  assert.match(detail, /linkedContentAssets\.isLoading && <ListRowsSkeleton/);
  assert.match(detail, /contentLinkedRows\.isLoading && <ListRowsSkeleton/);
  // چرخنده‌های درون دکمه (اقدام‌های مرحله) دست‌نخورده می‌مانند.
  assert.match(detail, /<InlineSpinner size="sm"/);
});

test('دکمهٔ «زمان‌بندی انتشار جدید» از میز انتشار حذف شده است', async () => {
  const publishing = await source('../src/components/content/ContentPublishingView.tsx');

  assert.doesNotMatch(publishing, /زمان‌بندی انتشار جدید/);
  assert.doesNotMatch(publishing, /data-button-action="create"/);
  // سربرگ فقط دکمهٔ بازگشت به فهرست محتوا را دارد.
  assert.match(publishing, /مدیریت و تولید محتوا/);
  assert.equal(publishing.match(/setActiveView\('content'\)/g)?.length, 1);

  // زمان‌بندی از راه‌های واقعی خودش باز می‌ماند: کارت تقویم و دکمهٔ «تنظیمات» هر ردیف.
  assert.match(publishing, /onScheduleContent=\{openScheduleModal\}/);
  assert.match(publishing, /onClick=\{\(\) => openScheduleModal\(c\)\}/);
  // و متن حالت خالی دیگر به دکمهٔ حذف‌شده ارجاع نمی‌دهد.
  assert.doesNotMatch(publishing, /از دکمهٔ «زمان‌بندی انتشار جدید»/);
  assert.match(publishing, /از تقویم انتشار یا دکمهٔ «تنظیمات» هر محتوا استفاده کنید/);
});
