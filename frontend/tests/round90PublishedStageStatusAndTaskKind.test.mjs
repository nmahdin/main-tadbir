import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { publicationSortKey, sortPublishedNewestFirst } from '../src/utils/publicationTiming.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** منبع یک فایل را برای بررسی الگوهای JSX برمی‌گرداند. */
const source = async (relative) => readFile(join(here, relative), 'utf8');

// ── ۱. محتواهای منتشرشده: از جدیدترین به قدیمی‌ترین ──
test('فهرست محتواهای منتشرشده پیش‌فرض از جدیدترین به قدیمی‌ترین مرتب می‌شود', async () => {
  const view = await source('../src/components/content/ContentPublishedView.tsx');
  assert.match(view, /import \{ sortPublishedNewestFirst \} from '\.\.\/\.\.\/utils\/publicationTiming';/);
  assert.match(view, /const publishedContents = sortPublishedNewestFirst<Content>\(/);
  // ترتیب نمایش‌داده‌شده جای دیگری دوباره عوض نشود که مرتب‌سازی را خنثی کند.
  assert.doesNotMatch(view, /publishedContents\.sort\(/);

  const items = [
    { id: 'old', publication: { date: '1404/05/01', time: '09:00' } },
    { id: 'newest', publication: { date: '1404/07/09', time: '18:30' } },
    { id: 'undated' },
    { id: 'mid', publication: { date: '1404/06/15', time: '12:00' } },
  ];
  const infoOf = (item) => ({ publication: item.publication });
  const ordered = sortPublishedNewestFirst(items, infoOf).map((item) => item.id);
  assert.deepEqual(ordered, ['newest', 'mid', 'old', 'undated'], 'جدیدترین اول و بی‌تاریخ آخر');
  // آرایهٔ ورودی نباید تغییر کند (props مشترک با جدول).
  assert.deepEqual(items.map((item) => item.id), ['old', 'newest', 'undated', 'mid']);
});

test('کلید زمان انتشار تاریخ شمسی را هم می‌فهمد', () => {
  // تاریخ شمسی برای مقایسه به میلادی تبدیل می‌شود (۱۴۰۴/۰۷/۰۹ = ۲۰۲۵-۱۰-۰۱).
  assert.equal(publicationSortKey({ date: '1404/07/09', time: '8:05' }), '2025-10-01T08:05');
  assert.equal(publicationSortKey({ date: '2025-09-30', time: '18:00' }), '2025-09-30T18:00');
  assert.equal(publicationSortKey(undefined, '1404-01-02'), '2025-03-22T00:00');
  assert.equal(publicationSortKey(undefined), '');
  // ساعت جاافتاده صفر در نظر گرفته می‌شود، نه «بی‌تاریخ».
  assert.ok(publicationSortKey({ date: '1404/07/09' }) < publicationSortKey({ date: '1404/07/09', time: '10:00' }));
});

// ── ۲. تقویم در باکس فیلتر نباید بریده شود ──
test('انتخابگرهای تاریخ باکس فیلتر با portal بیرون از کادر رندر می‌شوند', async () => {
  const view = await source('../src/components/content/ContentPublishedView.tsx');
  const pickers = view.match(/<PersianDatePicker[^>]*\/>/g) || [];
  const filterPickers = pickers.filter((picker) => /تاریخ انتشار/.test(picker) === false);
  assert.ok(filterPickers.length >= 2, 'انتخابگر «از تاریخ» و «تا تاریخ» باید وجود داشته باشند');
  filterPickers.forEach((picker) => assert.match(picker, /\bportal\b/, 'کادر تقویم نباید داخل باکس فیلتر بریده شود'));
});

// ── ۳. تغییر نام نمایشی در مدال پیش‌نمایش ──
test('مدال پیش‌نمایش خروجی امکان تغییر نام نمایشی دارد', async () => {
  const sections = await source('../src/components/content/StageAssetSections.tsx');
  assert.match(sections, /onRenameOutput\?: \(view: StageAssetView, title: string\) => Promise<void>;/);
  assert.match(sections, /const \[renameDraft, setRenameDraft\] = useState\(''\)/);
  assert.match(sections, /const canRename = Boolean\(view && \(onRenameOutput \|\| \(assetId && canEditTextAsset\)\)\)/);
  assert.match(sections, /if \(onRenameOutput\) await onRenameOutput\(view, title\)/);
  assert.match(sections, /ذخیرهٔ نام/);
  // خطا باید در همان مدال دیده شود، نه فقط در کنسول.
  assert.match(sections, /renameError && <p role="alert"/);

  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /onRenameOutput=\{canRenameOutput \? async \(target, title\) => \{/);
  assert.match(detail, /await renameStageOutput\(content\.id, target\.stageId, target\.outputId, title\)/);

  const context = await source('../src/context/AppContext.tsx');
  assert.match(context, /renameStageOutput: \(contentId: string, stageId: string, outputId: string, name: string\) => Promise<boolean>;/);
  assert.match(context, /renameStageOutput,/);
});

// ── ۴. وضعیت مرحله با کلیک روی نشان تغییر می‌کند ──
test('نشان وضعیت مرحله کلیک‌پذیر است و وضعیت‌های تأییدشده/در انتظار بررسی قفل نیستند', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /const stageStatusControl = \(stage: ContentStage, readyForStart: boolean\) => \{/);
  assert.match(detail, /\{stageStatusControl\(stage, readyForStart\)\}/);
  // فهرست وضعیت‌ها باید شامل وضعیت‌های پایانی باشد؛ این‌ها دیگر غیرفعال نمی‌شوند.
  const choices = detail.slice(detail.indexOf('const stageStatusChoices'));
  assert.match(choices, /id: 'approved'/);
  assert.match(choices, /id: 'pending_approval'/);
  assert.match(choices, /id: 'completed'/);
  assert.doesNotMatch(detail, /مرحلهٔ تأییدشده قابل تغییر نیست/);
  assert.match(detail, /await setStageStatus\(content\.id, stage\.id, status\)/);
  // بدون مجوز مدیریت جریان، منو باز نمی‌شود.
  assert.match(detail, /canManageContentWorkflow/);

  const api = await source('../src/api/contents.ts');
  assert.match(api, /stageStatus: \(id: string, stage: string, status: string, expectedVersion\?: string\)/);
  assert.match(api, /\/contents\/\$\{id\}\/stages\/\$\{encodeURIComponent\(stage\)\}\/status/);
});

test('سمت سرور وضعیت مرحله با یک فرمان اختصاصی و کنترل نسخه تغییر می‌کند', async () => {
  const review = await source('../../backend/app/Services/ContentReview.php');
  assert.match(review, /EDITABLE_STAGE_STATUSES/);
  assert.match(review, /public function overrideStageStatus\(User \$actor, Content \$content, string \$stageId, array \$data\): Content/);
  assert.match(review, /'pending_approval'/);
  assert.match(review, /'approved'/);
  // خروج از وضعیت پایانی باید کار همان مرحله را هم باز کند.
  assert.match(review, /where\('status', 'completed'\)\s*\n\s*->update\(\['status' => 'backlog'\]\)/);

  const routes = await source('../../backend/routes/api.php');
  assert.match(routes, /contents\/\{content\}\/stages\/\{stage\}\/status/);
  assert.match(routes, /ContentStageStatusController/);
});

// ── ۵. مهلت مرحله: تقویم مستقیم ──
test('کلیک روی تاریخ مهلت مرحله مستقیم تقویم را باز می‌کند', async () => {
  const picker = await source('../src/components/common/PersianDatePicker.tsx');
  assert.match(picker, /variant\?: 'field' \| 'panel'/);
  assert.match(picker, /onClose\?: \(\) => void/);
  assert.match(picker, /const panelOnly = variant === 'panel'/);
  // حالت پنل فقط تقویم است؛ هیچ فیلد ورودی‌ای برای کلیک دوباره نمی‌ماند.
  assert.match(picker, /if \(panelOnly\) \{/);

  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /variant="panel"/);
  assert.match(detail, /onClose=\{\(\) => setStageDeadlinePicker\(null\)\}/);
  assert.doesNotMatch(detail, /مهلت این مرحله \(تکمیل‌شده\) — برای تغییر کلیک کنید<\/p>/);
});

// ── ۶. سایهٔ بسیار کم روی دکمه‌های انتشار و ویرایش ──
test('دکمه‌های انتشار و ویرایش محتوا سایهٔ بسیار کمی دارند', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');
  /** برشِ کوتاه پیش از متن دکمه، تا کلاس‌های همان تگ بررسی شود. */
  const buttonBefore = (needle) => {
    const end = detail.indexOf(needle);
    assert.ok(end > -1, `دکمهٔ «${needle}» پیدا نشد`);
    const start = detail.lastIndexOf('<button', end);
    assert.ok(start > -1, 'تگ دکمه پیدا نشد');
    return detail.slice(start, end + needle.length);
  };

  const editButton = buttonBefore('ویرایش محتوا</button>');
  assert.match(editButton, /\bui-quiet-shadow\b/);
  assert.doesNotMatch(editButton, /shadow-lg|shadow-xl|shadow-2xl/);

  const publishButton = buttonBefore("? 'در حال ثبت…' : 'انتشار'}</button>");
  assert.match(publishButton, /\bui-quiet-shadow\b/);
  // سایه نباید دوباره با کلاس تیلویند خنثی یا تقویت شود.
  assert.doesNotMatch(publishButton, /shadow-2xs|shadow-xs|shadow-md/);

  const css = await source('../src/index.css');
  const block = css.slice(css.indexOf('.ui-quiet-shadow {'));
  assert.match(block, /box-shadow: 0 1px 2px rgb\(15 23 42 \/ \.07\), 0 1px 1px rgb\(15 23 42 \/ \.04\)/);
});

// ── ۷. لغو انتشار، وظیفهٔ انتشار را باز می‌کند ──
test('لغو انتشار وظیفهٔ مربوط را از «تکمیل‌شده» بیرون می‌آورد', async () => {
  const sync = await source('../../backend/app/Services/ContentStageTaskSync.php');
  assert.match(sync, /ContentPublication::published\(\$content\)/);
  assert.match(sync, /'publish'/);
  // وقتی محتوا منتشر نشده، مرحلهٔ انتشار نباید کارهایش را ببندد.
  assert.match(sync, /not_started/);

  const tests = await source('../../backend/tests/Feature/ContentPublicationTasksTest.php');
  assert.match(tests, /public function test_unpublish_keeps_the_publication_task_open_after_resync/);
});

// ── ۸. فیلتر نوع وظیفه در صفحهٔ تسک‌ها ──
test('صفحهٔ تسک‌ها کنار وضعیت، فیلتر نوع وظیفه هم دارد', async () => {
  const view = await source('../src/components/tasks/MyTasksView.tsx');
  assert.match(view, /const \[kindFilter, setKindFilter\] = useUrlFilter<string>\('kind', 'all'\)/);
  assert.match(view, /const matchesKind = kindFilter === 'all' \|\| \(t\.kind \|\| 'general'\) === kindFilter;/);
  assert.match(view, /return matchesStatus && matchesPriority && matchesScope && matchesKind && matchesTimeframe;/);
  assert.match(view, /aria-label="فیلتر نوع وظیفه"/);
  assert.match(view, /const TASK_KIND_FILTERS: \{ id: string; label: string \}\[\] = \[/);
  ['general', 'content_work', 'content_review', 'content_correction', 'content_publish'].forEach((kind) => {
    assert.match(view, new RegExp(`\\{ id: '${kind}', label: `));
  });
  assert.match(view, /<option value="all">همه نوع‌ها<\/option>/);
});
