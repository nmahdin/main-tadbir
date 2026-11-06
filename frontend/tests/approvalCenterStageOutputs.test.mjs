import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OUTPUT_KIND_LABELS, outputExtension, outputFormatBadge, outputVisualKind } from '../src/utils/outputFiles.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('نوع خروجی از نام فایل، MIME و شکل ردیف تشخیص داده می‌شود', () => {
  assert.equal(outputVisualKind({ fileName: 'poster.png' }), 'image');
  assert.equal(outputVisualKind({ url: '/api/v1/dam/files/3?v=2', mimeType: 'image/jpeg' }), 'image');
  assert.equal(outputVisualKind({ fileName: 'teaser.mp4' }), 'video');
  assert.equal(outputVisualKind({ fileName: 'voice.mp3' }), 'audio');
  assert.equal(outputVisualKind({ fileName: 'brief.pdf' }), 'pdf');
  assert.equal(outputVisualKind({ fileName: 'report.docx' }), 'word');
  assert.equal(outputVisualKind({ fileName: 'plan.xlsx' }), 'excel');
  assert.equal(outputVisualKind({ fileName: 'deck.pptx' }), 'powerpoint');
  assert.equal(outputVisualKind({ fileName: 'bundle.zip' }), 'archive');
  assert.equal(outputVisualKind({ fileName: 'notes.txt' }), 'text');
  assert.equal(outputVisualKind({ dataTableName: 'جدول کمپین' }), 'table');
  assert.equal(outputVisualKind({ type: 'link', value: 'https://example.com' }), 'link');
  assert.equal(outputVisualKind({ type: 'text', value: 'متن تأیید' }), 'text');
  assert.equal(outputVisualKind({ name: 'خروجی بی‌قالب' }), 'file');
});

test('پسوند و نشان قالب برای نمایش کوتاه درست ساخته می‌شود', () => {
  assert.equal(outputExtension({ fileName: 'Final-Poster.PDF' }), 'pdf');
  assert.equal(outputExtension({ url: '/api/v1/dam/files/7?download=1' }), '');
  assert.equal(outputExtension({}), '');
  assert.equal(outputFormatBadge({ fileName: 'brief.pdf' }), 'PDF');
  assert.equal(outputFormatBadge({ fileName: 'teaser.mp4' }), 'MP4');
  assert.equal(outputFormatBadge({ fileName: 'report.docx' }), OUTPUT_KIND_LABELS.word);
  assert.equal(outputFormatBadge({ type: 'text', value: 'متن' }), OUTPUT_KIND_LABELS.text);
});

test('پنجرهٔ نمایش خروجی فقط خروجی همان مرحلهٔ در حال بررسی را فهرست می‌کند', async () => {
  const center = await source('../src/components/workspace/ApprovalCenter.tsx');

  assert.match(center, /outputRow\.outputs\.map\(\(output: any, index: number\) => \(/);
  assert.match(center, /خروجی‌های همین مرحله/);
  assert.match(center, /Array\.isArray\(outputRow\?\.outputs\) \? outputRow\.outputs\.length : 0\)\.toLocaleString\('fa-IR'\)\} مورد/);
  assert.match(center, /<ApprovalOutputCard key=\{output\.id \|\| index\} output=\{output\} canPreview=\{canPreviewAssets\}/);
  // داور نباید خروجی مرحله‌های پیشین را ببیند.
  assert.doesNotMatch(center, /مرحلهٔ قبل/);

  // دور ۸۲: تا پنجره باز نشود هیچ درخواستی نمی‌رود.
  assert.doesNotMatch(center, /useQuery\(/);
});

test('کارت خروجی تصویر را لود می‌کند و اطلاعات جدول را همان‌جا می‌خواند', async () => {
  const card = await source('../src/components/workspace/ApprovalOutputCard.tsx');

  // تصویر: بندانگشتی سبک و همان‌جا، نه دکمهٔ «مشاهده».
  assert.match(card, /damApi\.library\.thumbnailUrl\(assetId, 640\)/);
  assert.match(card, /<ImagePreview src=\{imageSrc\} alt=\{title\} heightClass="h-56"/);

  // جدول اطلاعات: ردیف‌ها از خود جدول خوانده و فیلدها نمایش داده می‌شوند.
  assert.match(card, /\/dam\/data-tables\/\$\{table!\.id\}\?per_page=5/);
  assert.match(card, /dataTableRowFields\(row\.cells, tableColumns\)/);
  assert.match(card, /در حال خواندن اطلاعات جدول…/);
  assert.match(card, /خواندن زندهٔ جدول ممکن نشد/);

  // بدون مجوز مخزن هیچ درخواستی نمی‌رود و همان برچسب‌های ثبت‌شده می‌آید.
  assert.match(card, /enabled: kind === 'table' && Boolean\(table\) && canPreview/);
  assert.match(card, /برای خواندن ردیف‌های این جدول به مجوز دیدن فایل‌های مخزن نیاز است/);

  // آیکون و نشان قالب مخصوص هر نوع فایل.
  assert.match(card, /image: \{ icon: ImageIcon/);
  assert.match(card, /table: \{ icon: Table2/);
  assert.match(card, /outputFormatBadge\(output\)/);
  assert.match(card, /بازکردن خروجی/);
});

test('سرور فقط خروجی همان مرحله و خروجی‌های ارجاع‌شده به آن را برمی‌گرداند', async () => {
  const [controller, test] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/ApprovalController.php'),
    source('../../backend/tests/Feature/ApprovalCenterOutputsTest.php'),
  ]);

  assert.match(controller, /private function reviewOutputs\(Content \$content, array \$stage\): array/);
  assert.match(controller, /\$push\(\$stage, 'current'\)/);
  assert.match(controller, /forwardedToStageId/);
  assert.match(controller, /'forwarded'/);
  // خروجی مرحله‌های پیشین یا پیش‌نیاز دیگر جمع نمی‌شود.
  assert.doesNotMatch(controller, /'previous'/);
  assert.doesNotMatch(controller, /dependsOnStageIds/);
  assert.match(controller, /if \(isset\(\$collected\[\$key\]\)\) \{\s*continue;\s*\}/);

  assert.match(test, /test_review_window_shows_only_the_stage_under_review/);
  assert.match(test, /test_review_window_includes_outputs_forwarded_to_this_stage_without_duplicates/);
  assert.match(test, /test_review_window_is_empty_when_the_review_stage_has_no_outputs/);
});
