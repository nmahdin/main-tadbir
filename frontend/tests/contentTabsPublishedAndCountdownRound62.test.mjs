import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const backend = path => readFileSync(new URL(`../../backend/${path}`, import.meta.url), 'utf8');

const workspace = source('components/workspace/WorkspaceList.tsx');
const listQuery = source('routing/listQuery.ts');
const published = source('components/content/ContentPublishedView.tsx');
const publishing = source('components/content/ContentPublishingView.tsx');
const detail = source('components/content/ContentDetailView.tsx');
const css = source('index.css');
const controller = backend('app/Http/Controllers/Api/V1/ContentController.php');

/**
 * دور ۶۲: تب «برنامه‌ریزی» در صفحهٔ محتواها، حذف «آماده انتشار» از تب
 * «نیازمند اقدام»، سبک‌سازی فهرست «محتوای منتشرشده» و کادر رنگی
 * «زمان انتشار باقی‌مانده» در جزئیات محتوا.
 */
test('صفحهٔ محتواها تب «برنامه‌ریزی» دارد و نشانی آن پذیرفته می‌شود', () => {
  assert.match(workspace, /\{ label: 'برنامه‌ریزی', icon: Sparkles, values: \{ status: 'planning' \} \},/);
  // پیش از «در حال تولید» و بعد از «نیازمند اقدام» می‌آید تا ترتیب جریان طبیعی بماند.
  const contentsBlock = workspace.slice(workspace.indexOf('  contents: ['));
  const need = contentsBlock.indexOf("values: { status: 'open' }");
  const planning = contentsBlock.indexOf("values: { status: 'planning' }");
  const producing = contentsBlock.indexOf("values: { status: 'producing' }");
  assert.ok(need < planning && planning < producing, 'ترتیب تب‌ها: نیازمند اقدام → برنامه‌ریزی → در حال تولید');
  assert.match(listQuery, /contents: \{ open: 'نیازمند اقدام', idea: 'ایده', draft: 'پیش‌نویس', planning: 'برنامه‌ریزی',/);
});

test('تب «نیازمند اقدام» پرونده‌های آماده انتشار را نشان نمی‌دهد', () => {
  assert.match(
    controller,
    /->whereNotIn\('status', \['published', 'archived', 'rejected', 'completed', 'cancelled', 'ready_to_publish'\]\)/,
  );
  // تب برنامه‌ریزی همچنان فقط وضعیت planning را می‌گیرد.
  assert.match(workspace, /values: \{ status: 'planning' \}/);
});

test('فهرست «محتوای منتشرشده» بدون دپارتمان و بدون عکس پرسنلی است', () => {
  assert.doesNotMatch(published, />دپارتمان</);
  assert.doesNotMatch(published, /dept\?\.name/);
  assert.doesNotMatch(published, /content\.departmentId/);
  // هیچ تصویری در جدول نیست؛ فقط نام مسئول اصلی و نام ناشر.
  assert.doesNotMatch(published, /<img\b/);
  assert.match(published, /<span className="text-xs font-medium text-slate-700">\{publisher\.name\}<\/span>/);
  assert.match(published, /<span className="text-xs font-medium text-slate-700">\{owner\.name\}<\/span>/);
  // هفت ستون باقی مانده و حالت خالی هم همان تعداد را پوشش می‌دهد.
  assert.equal((published.match(/<th className="p-4/g) || []).length, 7);
  assert.match(published, /<td colSpan=\{7\}/);
});

test('دکمه‌های عملیات در «محتوای منتشرشده» و میز انتشار ۳۶px با سایهٔ ریز هستند', () => {
  const rule = css.match(/\.ui-action-button \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule, 'قاعدهٔ .ui-action-button باید در index.css باشد');
  assert.match(rule, /height: var\(--button-height\);/);
  assert.match(rule, /min-height: var\(--button-height\);/);
  assert.match(rule, /box-shadow: var\(--button-shadow\) !important;/);
  assert.match(css, /\.ui-action-button:active:not\(:disabled\) \{[^}]*box-shadow: var\(--button-shadow-pressed\) !important;/);

  // سه دکمهٔ عملیات فهرست منتشرشده: کپی، لغو انتشار و بایگانی.
  assert.equal((published.match(/className="ui-action-button px-3 text-xs"/g) || []).length, 3);
  assert.doesNotMatch(published, /min-h-9 px-3 py-2 text-xs/);

  // میز انتشار: «انتشار آنی/انتشار» و «تنظیمات/تنظیم» در هر دو نما.
  assert.equal((publishing.match(/ui-action-button/g) || []).length, 4);
  assert.doesNotMatch(publishing, /shadow-xs transition-all flex items-center gap-1 cursor-pointer/);
});

test('کادر «زمان انتشار باقی‌مانده» رنگی است و زمان فقط در بالای صفحهٔ جزئیات می‌آید', () => {
  assert.match(detail, /const contentPublication = publicationRemaining\(content\.publishInfo, \{ published: isPublished \}\)/);
  assert.match(detail, /const contentPublicationTone = contentPublication\?\.tone \?\? 'unknown';/);
  assert.match(detail, /const contentPublicationSurfaceTone = PUBLICATION_SURFACE_TONE_CLASSES\[contentPublicationTone\];/);
  assert.match(detail, /const contentPublicationTextTone = PUBLICATION_TEXT_TONE_CLASSES\[contentPublicationTone\];/);
  assert.match(detail, /const contentPublicationIconTone = PUBLICATION_ICON_TONE_CLASSES\[contentPublicationTone\];/);
  assert.match(detail, /className=\{`rounded-2xl border p-3 \$\{contentPublicationSurfaceTone\}`\} role="status" aria-live="polite"/);
  assert.match(detail, /زمان انتشار باقی‌مانده/);
  // تاریخ/ساعت انتشار در دو جا: کادر رنگی سربرگ و ردیف سادهٔ تب «تنظیمات انتشار».
  const stamps = detail.match(/formatPersianDateTime\(content\.publishInfo\?\.date, content\.publishInfo\?\.time\)/g) || [];
  assert.equal(stamps.length, 2);
  // ردیف تب تنظیمات انتشار بدون رنگ و بدون شمارش معکوس است.
  assert.match(detail, /<div className="border-t border-slate-200\/60 pt-3"><span className="block text-slate-500">زمان انتشار:<\/span><span className="mt-1 block font-bold text-slate-800">\{formatPersianDateTime\(content\.publishInfo\?\.date, content\.publishInfo\?\.time\) \|\| 'تنظیم نشده'\}<\/span><\/div>/);
  assert.match(detail, /<span className="block text-slate-500">ناشر:<\/span>/);
  // شمارش معکوس فقط یک بار (کادر سربرگ) محاسبه می‌شود.
  assert.equal((detail.match(/publicationRemaining\(/g) || []).length, 1);
});
