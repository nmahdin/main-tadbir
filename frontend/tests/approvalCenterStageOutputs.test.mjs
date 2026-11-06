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

test('پنجرهٔ نمایش خروجی همهٔ خروجی‌های مرحله را با آیکون و نشان قالب نشان می‌دهد', async () => {
  const center = await source('../src/components/workspace/ApprovalCenter.tsx');

  // فهرست کامل، بدون بریدن: همان آرایهٔ خروجی‌های مرحله روی همهٔ اعضا گردش می‌کند.
  assert.match(center, /outputRow\.outputs\.map\(\(output: any, index: number\)/);
  assert.match(center, /همهٔ خروجی‌های این مرحله/);
  assert.match(center, /Array\.isArray\(outputRow\?\.outputs\) \? outputRow\.outputs\.length : 0\)\.toLocaleString\('fa-IR'\)\} مورد/);

  // آیکون و نشانِ مخصوص هر نوع فایل، نه یک آیکون یکسان برای همه.
  assert.match(center, /const visual = visualOf\(output\)/);
  assert.match(center, /outputFormatBadge\(output\)/);
  assert.match(center, /OUTPUT_KIND_LABELS\[outputVisualKind\(output\)\]/);
  assert.match(center, /image: \{ icon: ImageIcon/);
  assert.match(center, /table: \{ icon: Table2/);
  assert.match(center, /link: \{ icon: Link2/);

  // منبع هر خروجی و نسبتش با مرحلهٔ در حال بررسی خوانا باشد.
  assert.match(center, /مرحلهٔ «\{stageLabel\}»/);
  assert.match(center, /OUTPUT_RELATIONS/);
  assert.match(center, /ارجاع‌شده به این مرحله/);
  assert.match(center, /مرحلهٔ پیش‌نیاز/);
  assert.match(center, /مرحلهٔ قبل/);

  // متن خروجی، فایل و پیوند هر سه دیده می‌شوند و پنجره دکمهٔ بستن ۳۶ پیکسلی دارد.
  assert.match(center, /output\.value && <p/);
  assert.match(center, /بازکردن خروجی/);
  assert.match(center, /<Button variant="secondary" onClick=\{\(\) => setOutputRow\(null\)\}>بستن<\/Button>/);

  // دور ۸۲: پنجره چیزی دانلود نمی‌کند تا کاربر بازکردن را بخواهد.
  assert.doesNotMatch(center, /useQuery\(/);
  assert.doesNotMatch(center, /stage\/\$\{encodeURIComponent\(outputRow/);
  assert.doesNotMatch(center, /request\(`\/contents\/\$\{outputRow/);
});

test('سرور خروجی خودِ مرحله، ارجاع‌شده‌ها، پیش‌نیاز و مرحلهٔ قبل را برمی‌گرداند', async () => {
  const [controller, test] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/ApprovalController.php'),
    source('../../backend/tests/Feature/ApprovalCenterOutputsTest.php'),
  ]);

  assert.match(controller, /private function reviewOutputs\(Content \$content, array \$stage\): array/);
  assert.match(controller, /\$push\(\$stage, 'current'\)/);
  assert.match(controller, /forwardedToStageId/);
  assert.match(controller, /'forwarded'/);
  assert.match(controller, /dependsOnStageIds/);
  assert.match(controller, /'dependency'/);
  assert.match(controller, /'previous'/);
  // هیچ خروجی‌ای دوبار نمی‌آید.
  assert.match(controller, /if \(isset\(\$collected\[\$key\]\)\) \{\s*continue;\s*\}/);

  assert.match(test, /test_review_window_lists_own_outputs_and_the_previous_stage_outputs/);
  assert.match(test, /test_review_window_includes_forwarded_and_own_outputs_without_duplicates/);
  assert.match(test, /test_review_window_is_empty_only_when_no_stage_has_outputs/);
});
