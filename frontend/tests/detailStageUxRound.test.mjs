import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('every stage lists its own inputs inside the stage card', async () => {
  const [detail, stageAssets] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/StageAssetSections.tsx'),
  ]);

  // همهٔ ورودی‌های اعلام‌شدهٔ مرحله در همان کارت رندر می‌شوند
  assert.match(detail, /const inputs = stageInputs\(stage\)/);
  assert.match(detail, /items=\{inputItems\.map\(item => item\.view\)\}/);
  // ورودی ارجاع‌شده حذف نمی‌شود؛ فقط برچسب می‌گیرد
  assert.match(stageAssets, /ارجاع‌شده از مرحلهٔ قبل/);
  assert.doesNotMatch(detail, /برای پرهیز از تکرار/);
});

test('collapsed input/output boxes reveal drafts and stay collapsed by default', async () => {
  const stageAssets = await source('../src/components/content/StageAssetSections.tsx');

  assert.match(stageAssets, /const \[open, setOpen\] = React\.useState\(\(\) => readSectionState\(kind\) \?\? defaultOpen \?\? false\)/);
  assert.match(stageAssets, /const pendingNames = pendingPreview\.map\(title => `«\$\{title\}»`\)\.join\('، '\)/);
  assert.match(stageAssets, /مورد پیش‌نویس/);
  assert.match(stageAssets, /title=\{pendingTitles\?\.join\('، '\)\}/);
  // هیچ چیزی در مرورگر ذخیره نمی‌شود؛ با بارگذاری دوباره، پیش‌فرض بسته برمی‌گردد
  assert.doesNotMatch(stageAssets, /localStorage|sessionStorage/);
});

test('deadline colours only belong to unfinished stages and to a live content', async () => {
  const [detail, badges] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/utils/statusBadges.tsx'),
  ]);

  // مرحلهٔ تکمیل‌شده: خنثی، بدون برچسب نسبی
  assert.match(detail, /const stageFinished = \['approved', 'completed', 'skipped'\]\.includes\(stage\.status\)/);
  assert.match(detail, /stageFinished \? 'later' : \(stageDeadline\?\.tier \?\? 'unknown'\)/);
  assert.match(detail, /stageFinished \|\| !stageDeadline \? '' : deadlineRelativeLabel\(stageDeadline\)/);

  // «مهلت نهایی» پرونده تا وقتی در جریان است ردهٔ رنگی می‌گیرد
  assert.match(detail, /const contentFinished = \['published', 'archived', 'cancelled', 'suspended'\]\.includes\(content\.status\) \|\| workflowReady/);
  assert.match(detail, /const contentDeadlineDelayed = !contentFinished && \['past', 'today', 'soon'\]\.includes\(contentDeadlineState\.tier\)/);
  assert.match(detail, /contentDeadlineState\.tier === 'past' \? 'border-violet-200 bg-violet-50\/70' : 'border-amber-200 bg-amber-50\/70'/);
  assert.match(detail, /className=\{`rounded-2xl border p-3 \$\{contentDeadlineTone\}`\}/);
  assert.match(detail, /وضعیت پرونده با بازبینی سرور به «در تأخیر» می‌رود/);

  // وضعیت مشتق «تأخیر» همان تن بنفش مهلت گذشته را دارد
  assert.match(badges, /delayed: 'border-violet-200 bg-violet-50 text-violet-700'/);
});

test('the active stage and the series badge use the unified system colour', async () => {
  const [detail, css] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/index.css'),
  ]);

  // مرحلهٔ فعال با رنگ یکپارچهٔ سامانه (indigo)، نه آبی خام
  assert.match(detail, /stage\.status === 'in_progress'\s*\n\s*\? 'bg-indigo-50\/50 border-indigo-400 ring-1 ring-indigo-100'/);
  assert.match(detail, /stage\.status === 'in_progress'\s*\n\s*\? 'bg-indigo-600 text-white'/);
  assert.doesNotMatch(detail, /bg-blue-50\/50|bg-blue-600/);

  // نشان مجموعهٔ مرتبط در سربرگ، هم‌رنگ سامانه (نشان تأخیر مراحل همچنان بنفش می‌ماند)
  assert.match(detail, /border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100/);
  assert.match(detail, /مجموعه: \{connectedSeries\?\.name/);
  const seriesBadge = detail.slice(detail.indexOf('مجموعه: {connectedSeries?.name') - 400, detail.indexOf('مجموعه: {connectedSeries?.name'));
  assert.match(seriesBadge, /border-indigo-200 bg-indigo-50 text-indigo-700/);
  assert.doesNotMatch(seriesBadge, /violet/);

  // رنگ سامانه یک متغیر واحد است، نه رنگ محلی صفحه‌ها
  assert.match(css, /--color-primary: #4f46e5/);
});

test('stage department chip only appears when it differs from the content department', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');

  assert.match(detail, /!sameId\(stage\.departmentId, departmentId\) && \(stageDept\?\.name \|\| stage\.departmentId\)/);
  assert.match(detail, /دپارتمان این مرحله با دپارتمان مجری پرونده تفاوت دارد/);
});

test('sidebar create menu pairs the new content series with the new content', async () => {
  const [sidebar, uiContext, appContext, seriesView] = await Promise.all([
    source('../src/components/layout/Sidebar.tsx'),
    source('../src/context/UIContext.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
  ]);

  const contentButton = sidebar.indexOf('<span>محتوای جدید</span>');
  const seriesButton = sidebar.indexOf('<span>مجموعه محتوای جدید</span>');
  assert.ok(contentButton > 0 && seriesButton > contentButton, 'مجموعهٔ جدید باید درست کنار محتوای جدید باشد');
  assert.ok(seriesButton - contentButton < 700, 'فاصلهٔ دو گزینه نباید بیش از یک گزینه باشد');
  assert.match(sidebar, /handleNavClick\('content-series'\); requestContentSeriesModal\(\); setIsQuickAddOpen\(false\)/);

  // درخواست جهانی → باز شدن فرم ساخت در همان صفحه
  assert.match(uiContext, /const \[contentSeriesModalRequest, setContentSeriesModalRequest\] = useState\(0\)/);
  assert.match(uiContext, /const requestContentSeriesModal = \(\) => setContentSeriesModalRequest\(value => value \+ 1\)/);
  assert.match(appContext, /contentSeriesModalRequest, setContentSeriesModalRequest/);
  assert.match(appContext, /requestContentSeriesModal,/);
  assert.match(seriesView, /if \(contentSeriesModalRequest > lastSeriesRequest\.current\)/);
  assert.match(seriesView, /setEditing\(null\);\s*\n\s*setFormOpen\(true\);/);
});
