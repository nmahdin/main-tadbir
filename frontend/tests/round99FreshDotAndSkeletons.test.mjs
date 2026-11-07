import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('نشانگر «تازه» فقط از زمان آخرین بازدید و مهر زمانی رکورد ساخته می‌شود', async () => {
  const freshness = await source('../src/utils/freshness.ts');

  // زمان دیدن هر فهرست جداگانه و پایدار در localStorage ذخیره می‌شود.
  assert.match(freshness, /const KEY_PREFIX = 'tadbir:last-seen:';/);
  assert.match(freshness, /export function readLastSeen\(scope: string\): number \| null/);
  assert.match(freshness, /export function markLastSeen\(scope: string, at: number = clock\.now\(\)\): void/);
  assert.match(freshness, /export function forgetLastSeen\(scope\?: string\): void/);

  // سرور `updated_at` می‌دهد و دادهٔ نمایشی `updatedAt`؛ هر دو خوانده می‌شوند.
  assert.match(freshness, /record\.updated_at \?\? record\.updatedAt \?\? record\.last_activity_at \?\? record\.lastActivityAt/);

  // اولین بازدید هیچ نقطه‌ای نمی‌سازد و رکورد بدون مهر زمانی هم «تازه» نمی‌شود.
  assert.match(freshness, /export function isFreshSince\(row: unknown, baseline: number \| null\): boolean \{/);
  assert.match(freshness, /if \(baseline === null\) return false;/);
  assert.match(freshness, /if \(stamp === null\) return false;/);
  assert.match(freshness, /return stamp > baseline;/);

  // در محیط خصوصی/ممنوع‌کوکی localStorage خطا می‌دهد؛ قابلیت خاموش می‌شود، نه صفحه.
  assert.match(freshness, /const probe = `\$\{KEY_PREFIX\}__probe__`;/);
  assert.match(freshness, /candidate\.setItem\(probe, '1'\);\s*\n\s*candidate\.removeItem\(probe\);/);

  // سبک: هیچ نظرسنجی دوره‌ای برای تازه‌سازی نقطه‌ها وجود ندارد.
  assert.doesNotMatch(freshness, /setInterval/);
  assert.doesNotMatch(freshness, /setTimeout/);
});

test('زمان مرجع یک بار در ورود خوانده و در خروج نوشته می‌شود', async () => {
  const freshness = await source('../src/utils/freshness.ts');

  // baseline در هر رندر دوباره خوانده نمی‌شود، وگرنه همهٔ نقطه‌ها همان لحظه می‌پریدند.
  assert.match(freshness, /const baseline = useMemo\(\(\) => readLastSeen\(scope\), \[scope\]\);/);
  assert.match(freshness, /export function useFreshRecords\(scope: string, rows: ReadonlyArray<unknown>\): FreshRecords \{/);

  // رفتن به فهرست دیگر، زمان دیدن فهرست قبلی را ثبت و مجموعهٔ بازشده‌ها را پاک می‌کند.
  assert.match(freshness, /return \(\) => markLastSeen\(scope\);/);
  assert.match(freshness, /setOpened\(new Set\(\)\);/);

  // ردیف بازشده بی‌درنگ از فهرست «تازه» بیرون می‌رود.
  assert.match(freshness, /if \(id !== undefined && openedRef\.current\.has\(String\(id\)\)\) return false;/);
  assert.match(freshness, /const markOpened = useCallback\(\(id: string \| number\) => \{/);
});

test('نقطهٔ تازه معنادار و کم‌هزینه است، نه تزئین خالی', async () => {
  const [dot, css] = await Promise.all([
    source('../src/components/common/FreshDot.tsx'),
    source('../src/index.css'),
  ]);

  // نقطه تزئینی است ولی معنا دارد؛ هم title دارد و هم aria-label و متن sr-only.
  assert.match(dot, /role="img" aria-label=\{label\} title=\{label\}/);
  assert.match(dot, /<span className="sr-only">\{label\}<\/span>/);
  assert.match(dot, /label = 'از آخرین بازدید شما تغییر کرده است'/);
  assert.match(dot, /export const FreshTag: React\.FC/);

  // ۶ پیکسل آبی با هالهٔ نرم و یک بار ورود نرم.
  assert.match(css, /\.ui-fresh-dot \{[\s\S]{0,220}width: \.375rem;[\s\S]{0,220}height: \.375rem;/);
  assert.match(css, /\.ui-fresh-dot \{[\s\S]{0,220}background-color: #0284c7;/);
  assert.match(css, /box-shadow: 0 0 0 2px #e0f2fe;/);
  assert.match(css, /@keyframes ui-fresh-in \{/);
  assert.match(css, /animation: ui-fresh-in \.22s cubic-bezier\(\.22, 1, \.36, 1\) both;/);

  // با prefers-reduced-motion خاموش می‌شود و قاعدهٔ مودال همچنان اولِ بلوک می‌ماند.
  assert.match(css, /\.ui-fresh-dot \{ animation: none !important; \}/);
  const blockStart = css.lastIndexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.ui-fresh-dot { animation: none'));
  const block = css.slice(blockStart);
  // قاعدهٔ مودال همچنان اولین قاعدهٔ این بلوک است.
  assert.match(block.slice(0, 260), /\.ui-modal-overlay, \.ui-modal-panel/);
  assert.ok(block.indexOf('.ui-fresh-dot { animation: none') > block.indexOf('.ui-shimmer'));
});

test('هر ردیف تازه در فهرست‌های کاری نقطه می‌گیرد و با باز شدن پاک می‌شود', async () => {
  const list = await source('../src/components/workspace/WorkspaceList.tsx');

  // هر فهرست، دامنهٔ خودش را دارد تا زمان دیدن وظایف با محتوا قاطی نشود.
  assert.match(list, /const fresh = useFreshRecords\(`workspace:\$\{module\}`, rows\);/);
  assert.match(list, /const freshMark = \(row: any\) => fresh\.isFresh\(row\) \? <FreshDot className="mt-0\.5" \/> : null;/);

  // نقطه کنار عنوان، هم در جدول و هم در کارت.
  assert.equal(list.match(/freshMark\(row\)/g)?.length, 2);
  assert.match(list, /<span className="flex min-w-0 items-start gap-1\.5">\{recordTitle\(row, 'font-extrabold/);
  assert.match(list, /<span className="flex min-w-0 items-start gap-1\.5">\{recordTitle\(row, 'font-black/);

  // همهٔ راه‌های باز کردن ردیف (عنوان، چشم، فلش) نقطه را پاک می‌کنند.
  assert.ok((list.match(/fresh\.markOpened\(row\.id\)/g)?.length ?? 0) >= 5);
  // عنوان وظیفه هم نقطه را با خودش می‌برد.
  assert.match(list, /onClick=\{\(\) => \{ fresh\.markOpened\(row\.id\); app\.setSelectedTaskId\(row\.id\); \}\}/);
});

const skeletonPages = [
  ['../src/components/workspace/NotificationInbox.tsx', 'ListRowsSkeleton', 'در حال دریافت اعلان‌ها…'],
  ['../src/components/workspace/ApprovalCenter.tsx', 'ApprovalCardsSkeleton', null],
  ['../src/components/analytics/AnalyticsView.tsx', 'ReportSkeleton', 'در حال محاسبه گزارش…'],
  ['../src/components/content/ContentDetailView.tsx', 'DetailPageSkeleton', 'در حال بارگذاری پروندهٔ محتوا…'],
  ['../src/components/projects/ProjectDetailView.tsx', 'DetailPageSkeleton', 'در حال دریافت خلاصه پروژه…'],
  ['../src/components/content/ContentSeriesView.tsx', 'DetailPageSkeleton', 'در حال دریافت فضای کاری مجموعه…'],
  ['../src/components/comments/CommentsView.tsx', 'ListRowsSkeleton', 'در حال دریافت دیدگاه‌ها…'],
  ['../src/components/departments/DepartmentDashboardView.tsx', 'ReportSkeleton', 'در حال دریافت داشبورد دپارتمان…'],
  ['../src/components/settings/IntegrityView.tsx', 'ReportSkeleton', 'در حال بررسی یکپارچگی داده‌ها…'],
  ['../src/components/settings/StorageBackupPanel.tsx', 'ListRowsSkeleton', 'در حال خواندن وضعیت ذخیره‌سازی…'],
  ['../src/components/tasks/TaskDetailDrawer.tsx', 'ListRowsSkeleton', 'در حال دریافت جزئیات وظیفه…'],
  ['../src/components/layout/TopNavbar.tsx', 'ListRowsSkeleton', 'در حال دریافت اعلان‌ها…'],
];

test('هیچ صفحه‌ای دیگر چرخندهٔ وسط‌چین یا متن «در حال …» خالی نشان نمی‌دهد', async () => {
  for (const [path, component, label] of skeletonPages) {
    const page = await source(path);
    assert.match(page, new RegExp(`import \\{[^}]*${component}[^}]*\\} from '\\.\\./common/Shimmer'`), path);
    assert.match(page, new RegExp(`<${component}`), path);
    if (label) assert.ok(page.includes(label), `${path} → ${label}`);
    // اسکلت جای خالی را پر می‌کند، نه اینکه کنارش بنشیند.
    assert.doesNotMatch(page, /<LoadingState/, path);
  }
});

test('اسکلت‌های تازه همان قالب محتوای مقصد را می‌کشند', async () => {
  const shimmer = await source('../src/components/common/Shimmer.tsx');

  // برچسب پیش‌فرض هر اسکلت همان چیزی است که صفحهٔ مقصد می‌گفت.
  assert.match(shimmer, /label = 'در حال دریافت موارد نیازمند بررسی…'/);

  for (const name of ['ListRowsSkeleton', 'ApprovalCardsSkeleton', 'ReportSkeleton', 'DetailPageSkeleton']) {
    assert.match(shimmer, new RegExp(`export const ${name}: React\\.FC`), name);
  }

  // ردیف‌های فهرست: آیکن + عنوان + زیرنویس + چیپ وضعیت.
  assert.match(shimmer, /export const ListRowsSkeleton: React\.FC<\{ rows\?: number; label\?: string; className\?: string \}>/);
  assert.match(shimmer, /rows = 5,/);
  // کارت‌های تأیید: نوار رنگی کنار، عنوان، مرحله و مهلت.
  assert.match(shimmer, /<span className="ui-shimmer absolute inset-y-0 right-0 w-1" \/>/);
  assert.match(shimmer, /export const ApprovalCardsSkeleton: React\.FC<\{ count\?: number; label\?: string \}>/);
  // گزارش: نمودار میله‌ای با ارتفاع واقعی، نه بلوک تخت.
  assert.match(shimmer, /\[62, 84, 46, 96, 70, 88, 54\]\.map\(\(height, bar\)/);
  assert.match(shimmer, /style=\{\{ height: `\$\{height}%` \}\}/);
  // صفحهٔ جزئیات: سربرگ + نوار تب‌ها + بدنه.
  assert.match(shimmer, /export const DetailPageSkeleton: React\.FC<\{ label\?: string; tabs\?: number \}>/);
  assert.match(shimmer, /Array\.from\(\{ length: tabs \}\)/);

  // هر چهار اسکلت با نقش «وضعیت» معرفی می‌شوند و تصویرشان از صفحه‌خوان پنهان است.
  // فقط چهار اسکلت این دور؛ اسکلت تقویم در دور بعد اضافه شد.
  const tail = shimmer.slice(shimmer.indexOf('ListRowsSkeleton'), shimmer.indexOf('CalendarSkeleton'));
  assert.equal(tail.match(/role="status" aria-live="polite" aria-busy="true"/g)?.length, 4);
  assert.equal(tail.match(/<div aria-hidden="true"/g)?.length, 4);
});

test('اسکلت‌ها چرخندهٔ تازه اضافه نمی‌کنند', async () => {
  const [approvals, analytics, detail] = await Promise.all([
    source('../src/components/workspace/ApprovalCenter.tsx'),
    source('../src/components/analytics/AnalyticsView.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
  ]);

  // جایگزینی، نه هم‌نشینی: چرخندهٔ بارگذاری این صفحه‌ها حذف شد.
  assert.doesNotMatch(approvals, /InlineSpinner/);
  assert.doesNotMatch(analytics, /InlineSpinner/);
  assert.doesNotMatch(detail, /<InlineSpinner size="lg"/);
  // و هیچ‌کدام چرخندهٔ تازه با سرعت سفارشی نساخته‌اند (تصمیم دور ۹۲).
  assert.doesNotMatch(approvals + analytics, /animation: spin 0\./);
});
