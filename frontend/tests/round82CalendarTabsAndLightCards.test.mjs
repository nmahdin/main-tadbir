import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۸۲ — تب‌های تقویم، حذف SHA از اطلاعات فنی، کارت خروجیِ سبک با آیکون نوع،
 * و حذف باکس تکراری محتوا در تقویم.
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const calendar = read('../src/components/projects/ProjectCalendarView.tsx');
const library = read('../src/components/dam/DamLibrary.tsx');
const preview = read('../src/components/dam/AssetPreviewModal.tsx');
const stage = read('../src/components/content/StageAssetSections.tsx');

test('تب‌های نوع رویداد: نوار سفید، تب فعال با رنگ اصلی، غیرفعال بی‌حاشیه', () => {
  // دور ۸۴: کل نوار تب‌ها سفید است و تب فعال با رنگ اصلی سامانه پر می‌شود.
  assert.match(calendar, /rounded-2xl border border-slate-200 bg-white p-1\.5 shadow-2xs/);
  assert.match(calendar, /'bg-indigo-600 text-white shadow-xs'/);
  // تب غیرفعال: شفاف، بدون حاشیه، فقط هاورِ کم‌رنگ.
  assert.match(calendar, /'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'/);
  // هیچ رنگ پُرِ اصلی و هیچ حاشیه‌ای روی تب‌ها نمانده باشد.
  assert.doesNotMatch(calendar, /border-indigo-600 bg-indigo-600 text-white/);
  assert.doesNotMatch(calendar, /border-slate-200 bg-white text-slate-600 hover:border-indigo-200/);
  assert.match(calendar, /rounded-xl border-0 px-3 py-1\.5/);
});

test('اثر انگشت SHA-256 از اطلاعات فنی دارایی حذف شده است', () => {
  assert.doesNotMatch(library, /SHA-256/);
  assert.match(library, /اطلاعات فنی فایل/);
  assert.match(library, /<span>اندازه: \{formatSize\(asset\.latest_file\.file_size\)\}<\/span><\/div><\/section>/);
  // فهرست نمونهٔ بستهٔ فشرده هم دیگر ردیف checksum نشان نمی‌دهد.
  assert.doesNotMatch(preview, /checksum\.sha256/);
});

test('کارت خروجی هیچ تصویر یا متنی لود نمی‌کند', () => {
  // هیچ درخواست تصویر/متن از کارت: نه بندانگشتی، نه جزئیات دارایی، نه پیش‌بارگذاری.
  assert.doesNotMatch(stage, /<SmartImage/);
  assert.doesNotMatch(stage, /useDamAssetDetail\(view\.assetId/);
  assert.doesNotMatch(stage, /needsAssetText/);
  assert.doesNotMatch(stage, /preloadImage\(/);
  // متن کوتاه فقط از خود ردیف خروجی (بدون شبکه).
  assert.match(stage, /const excerpt = textExcerpt\(view\);/);
  assert.match(stage, /const typeLabel = stageAssetTypeLabel\(view\);/);
  // مدال پیش‌نمایش: خواندن تصویر/متن فقط با باز شدن مدال.
  assert.match(stage, /const asset = useDamAssetDetail\(assetId, canLoadAsset\);/);
});

test('آیکون هر خروجی متناسب با نوع فایل است', () => {
  assert.match(stage, /export type StageAssetVisualKind = 'image' \| 'video' \| 'audio' \| 'pdf' \| 'word' \| 'excel' \| 'powerpoint' \| 'archive' \| 'text' \| 'table' \| 'link' \| 'file';/);
  assert.match(stage, /export const stageAssetVisualKind = \(view: StageAssetView\): StageAssetVisualKind => \{/);
  assert.match(stage, /export const stageAssetIcon = \(view: StageAssetView\) => VISUAL_ICONS\[stageAssetVisualKind\(view\)\];/);
  // آیکون‌های واقعی هر دسته.
  for (const pair of [
    "image: { icon: ImageIcon",
    "video: { icon: Video",
    "audio: { icon: Music",
    "pdf: { icon: FileText",
    "word: { icon: FileType",
    "excel: { icon: FileSpreadsheet",
    "powerpoint: { icon: Presentation",
    "archive: { icon: FileArchive",
    "text: { icon: FileText",
    "table: { icon: TableProperties",
    "link: { icon: Link2",
  ]) {
    assert.ok(stage.includes(pair), pair);
  }
  // کارت و سربرگ مدال از همان آیکون استفاده می‌کنند.
  assert.match(stage, /const Icon = visual\.icon;/);
  assert.match(stage, /const ModalIcon = stageAssetIcon\(view\)\.icon;/);
});

test('هر محتوا در تقویم فقط یک باکس دارد', () => {
  // باکس مهلت و باکس انتشار ادغام شدند: یک رویداد با شناسهٔ `content-<id>`.
  assert.match(calendar, /id: `content-\$\{content\.id\}`,/);
  assert.doesNotMatch(calendar, /content-publish-/);
  assert.doesNotMatch(calendar, /content-deadline-/);
  // دور ۸۴: تاریخ انتشار اولویت دارد تا محتوای منتشرشده هم روی تقویم بماند و
  // مهلت تولید در توضیح همان کارت بیاید.
  assert.match(calendar, /const date = publishDate \|\| scheduledDate \|\| deadline \|\| fallback;/);
  assert.match(calendar, /مهلت تولید: \$\{deadline\}/);
});
