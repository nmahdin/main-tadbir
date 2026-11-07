import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('اسکلت‌ها همان قالب محتوا را می‌کشند، نه یک بلوک تنها', async () => {
  const [shimmer, css] = await Promise.all([
    source('../src/components/common/Shimmer.tsx'),
    source('../src/index.css'),
  ]);

  // هر اسکلت نقش و برچسب خوانده‌شدنی دارد و عناصر تصویری از صفحه‌خوان پنهان‌اند.
  assert.match(shimmer, /role="status" aria-live="polite" aria-busy="true"/);
  assert.match(shimmer, /<span className="sr-only">\{label\}<\/span>/);
  assert.match(shimmer, /const SHIMMER_BASE = 'ui-shimmer rounded-md';/);

  // قالب‌ها: جدول با سرستون واقعی، کارت، تخته، کاشی دارایی و کارت آماری.
  for (const name of ['TableSkeleton', 'CardGridSkeleton', 'BoardSkeleton', 'TileGridSkeleton', 'StatCardsSkeleton']) {
    assert.match(shimmer, new RegExp(`export const ${name}: React\\.FC`), name);
  }
  // ارتفاع ردیف‌ها و ستون عنوان همان جدول واقعی است.
  assert.match(shimmer, /<td className="max-w-sm p-4">/);
  assert.match(shimmer, /<tr className="border-b border-slate-200 bg-slate-50\/80 text-xs font-bold text-slate-400">/);

  // درخشش با حرکت پس‌زمینه است (کامپوزیت‌شدنی) و با کاهش حرکت خاموش می‌شود.
  assert.match(css, /@keyframes ui-shimmer \{\s*\n\s*from \{ background-position: 100% 0 \}\s*\n\s*to \{ background-position: 0 0 \}/);
  assert.match(css, /\.ui-shimmer \{\s*\n\s*background-color: #eef2f7;/);
  assert.match(css, /\.ui-shimmer \{ animation: none !important; background-image: none; \}/);
  // ورود نرم محتوای واقعی روی اسکلت.
  assert.match(css, /@keyframes ui-swap-in \{/);
  assert.match(css, /\.ui-swap-in \{ animation: ui-swap-in \.18s ease-out both; \}/);
});

test('فهرست‌ها جای چرخندهٔ وسط‌چین اسکلت هم‌شکل نشان می‌دهند', async () => {
  const [workspace, dam] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
  ]);

  // نما تعیین می‌کند کدام اسکلت بیاید: کارت، کانبان یا جدول با سرستون همان ماژول.
  assert.match(workspace, /view === 'cards' \? <CardGridSkeleton count=\{6\} \/>/);
  assert.match(workspace, /module === 'tasks' && view === 'kanban' \? <BoardSkeleton columns=\{4\} \/>/);
  assert.match(workspace, /<TableSkeleton rows=\{6\} columns=\{module === 'tasks'/);
  // چرخندهٔ قدیمی جای خودش را داده و محتوا با محو شدن می‌آید.
  assert.doesNotMatch(workspace, /LoadingState label="در حال دریافت فهرست از سرور…"/);
  assert.match(workspace, /className="ui-swap-in relative"/);

  // کتابخانهٔ دارایی: کاشی برای شبکه، ردیف برای جدول/فهرست.
  assert.match(dam, /viewMode === 'grid'\s*\n\s*\? <TileGridSkeleton count=\{9\}/);
  assert.match(dam, /<TableSkeleton rows=\{8\} columns=\{viewMode === 'table'/);
  assert.doesNotMatch(dam, /<LoaderCircle className="h-4 w-4 animate-spin" \/>در حال دریافت اطلاعات\.\.\./);
});

test('اعداد و نوارهای پیشرفت داشبورد زنده‌اند و به دادهٔ واقعی می‌رسند', async () => {
  const [countUp, dashboard] = await Promise.all([
    source('../src/components/common/CountUp.tsx'),
    source('../src/components/dashboard/DashboardView.tsx'),
  ]);

  // مقدار نهایی همیشه همان عدد واقعی است و با کاهش حرکت بی‌درنگ نمایش داده می‌شود.
  assert.match(countUp, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(countUp, /else \{ fromRef\.current = target; setCurrent\(target\); \}/);
  // انیمیشن با rAF و منحنی خروج نرم، با ارقام فارسی.
  assert.match(countUp, /frameRef\.current = requestAnimationFrame\(tick\);/);
  assert.match(countUp, /const eased = 1 - Math\.pow\(1 - progress, 3\);/);
  assert.match(countUp, /shown\.toLocaleString\('fa-IR'\)/);
  // نوار پیشرفت از صفر پر می‌شود و نقش دسترس‌پذیر دارد.
  assert.match(countUp, /const \[width, setWidth\] = useState\(\(\) => \(prefersReducedMotion\(\) \? clamped : 0\)\);/);
  assert.match(countUp, /role="progressbar"/);

  // چهار کارت آماری داشبورد و نوارهای پیشرفت پروژه‌ها از این‌ها استفاده می‌کنند.
  assert.match(dashboard, /import \{ AnimatedProgress, CountUp \} from '\.\.\/common\/CountUp';/);
  for (const value of [
    "projects.filter(p => p.status === 'active').length",
    'myPendingTasks.length',
    'activeContents.length',
    'pendingLetters.length',
  ]) {
    assert.ok(dashboard.includes(`<CountUp value={${value}} className="text-2xl font-black text-slate-900" />`), value);
  }
  assert.match(dashboard, /<AnimatedProgress progress=\{proj\.progress\} color=\{proj\.color\} size="md" showLabel label="پیشرفت" \/>/);
  // تا رسیدن دادهٔ فضای کاری، همان کارت‌های آماری با شامر کشیده می‌شوند.
  assert.match(dashboard, /\{isWorkspaceLoading \? <StatCardsSkeleton count=\{4\} className="grid grid-cols-2 md:grid-cols-4 gap-4" \/> : \(/);
  // دیگر عدد خام در کارت‌های آماری نیست.
  assert.doesNotMatch(dashboard, /<span className="text-2xl font-black text-slate-900">\{/);
});
