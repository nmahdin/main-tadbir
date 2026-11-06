import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۷۲: لود تدریجی تصاویر، لودینگ پیش‌نمایش خروجی‌ها و چیدمان راست‌چین مخزن.
 *
 * قراردادهای این دور:
 *  - تصویر همان لحظهٔ رندر درخواست می‌شود (بدون تأخیر)، ولی تا آماده‌شدن «مات»
 *    است و سپس در نیم‌ثانیه واضح می‌شود؛ هیچ درخواست اضافه‌ای هم ندارد.
 *  - مدال پیش‌نمایش خروجی محتوا تا لود متن/تصویر/فایل اسکلت لودینگ نشان می‌دهد.
 *  - ستون انتخاب در فهرست دارایی‌ها سمت راست است و نوار اقدام همگانی هم راست
 *    می‌شود و دکمهٔ حذف دارد.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('../src/index.css');
const smart = read('../src/components/common/SmartImage.tsx');
const preload = read('../src/utils/imagePreload.ts');
const avatar = read('../src/components/common/Avatar.tsx');
const imagePreview = read('../src/components/common/ImagePreview.tsx');
const dam = read('../src/components/dam/DamLibrary.tsx');
const quickPreview = read('../src/components/dam/DamAssetQuickPreview.tsx');
const stage = read('../src/components/content/StageAssetSections.tsx');

test('images start loading immediately and sharpen from a blurred state', () => {
  // تصویر از نخستین رندر در DOM است: هیچ «منتظر ماندن» قبل از درخواست نیست.
  assert.match(smart, /<img\s+ref=\{imgRef\}\s+src=\{url\}/);
  assert.match(smart, /loading=\{priority \? 'eager' : 'lazy'\}/);
  assert.match(smart, /fetchPriority=\{priority \? 'high' : 'auto'\}/);
  // گذار «مات → واضح» فقط CSS است و پس از آماده‌شدن رمزگشایی اجرا می‌شود.
  assert.match(smart, /node\.decode\(\)\.then\(markReady\)\.catch\(markReady\)/);
  assert.match(smart, /ui-img-media/);
  assert.match(css, /\.ui-img-media \{[^}]*filter: blur\(20px\)/);
  assert.match(css, /\.ui-img-media\.is-ready \{ opacity: 1; filter: none; transform: scale\(1\); \}/);
  // پس‌زمینهٔدرخشان تا آماده‌شدن، و احترام به کاهش حرکت.
  assert.match(css, /\.ui-img-glow \{[^}]*animation: ui-img-shimmer/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ui-img-glow \{ animation: none; \}/);
});

test('the progressive loader never adds network requests and preloads on intent', () => {
  // یک درخواست واحد: هیچ نسخهٔ کوچک/دومی از تصویر درخواست نمی‌شود.
  assert.equal(smart.match(/src=\{url\}/g)?.length, 1);
  assert.equal(smart.match(/<img\s+\n?\s*ref=\{imgRef\}/g)?.length, 1);
  assert.match(preload, /export function preloadImage\(src\?: string \| null\): void \{/);
  assert.match(preload, /image\.src = url;/);
  // دور ۸۴: کارت مخزن دیگر فایل اصلی را پیش‌بارگذاری نمی‌کند؛ نسخهٔ کوچکِ
  // کش‌شده روی خود کارت می‌آید و فایل کامل فقط با باز شدن مدال دانلود می‌شود.
  assert.match(dam, /const thumbSrc = isImage \? damApi\.library\.thumbnailUrl\(asset\.id, 320\) : '';/);
  assert.doesNotMatch(dam, /imageIntentProps\(previewSrc\)/);
  // دور ۸۲: کارت خروجی محتوا هیچ تصویری پیش‌بارگذاری (یا لود) نمی‌کند؛ تصویر
  // فقط وقتی مدال «پیش‌نمایش» باز شود گرفته می‌شود.
  assert.doesNotMatch(stage, /preloadImage\(/);
  assert.doesNotMatch(stage, /<SmartImage/);
});

test('profile avatars use the progressive loader and keep the initials fallback', () => {
  assert.match(avatar, /<SmartImage/);
  assert.match(avatar, /getInitials\(displayName\)/);
  assert.match(avatar, /className=\{`inline-flex shrink-0 rounded-full/);
});

test('the content output preview modal shows a loading state for text and media', () => {
  assert.match(stage, /function PreviewSkeleton\(/);
  // دور ۷۵: پردهٔ لودینگ اختصاصی برای تصویر/فایل هم اضافه شد و برچسب اسکلت
  // به‌صورت پارامتر می‌آید؛ متن پیش‌فرض همان «در حال دریافت پیش‌نمایش…» است.
  assert.match(stage, /aria-label=\{label\}/);
  assert.match(stage, /در حال دریافت پیش‌نمایش…/);
  assert.match(stage, /payload\.mode === 'loading' && <PreviewSkeleton \/>/);
  // تصویر: اسکلت + نشانگر تا رمزگشایی، سپس نمایش واضح (دور ۷۴ به لودر مشترک منتقل شد).
  // دور ۷۹: تصویری که همین حالا لود شده، هیچ نشانهٔ لودینگ نمی‌گیرد.
  assert.match(imagePreview, /const showLoading = !ready && !cached;/);
  assert.match(imagePreview, /showLoading && <div className="ui-skeleton absolute inset-0" aria-hidden \/>/);
  assert.match(imagePreview, /در حال لود تصویر…/);
  // دور ۷۵: پیش از تصویر یک پردهٔ لودینگ و پس از آماده‌شدن، خودِ تصویر می‌آید.
  assert.match(stage, /payload\.mode === 'image' && \([\s\S]{0,400}<ImagePreview/);
  // دور ۷۷: لودینگ تصویر فقط از خودِ `ImagePreview` می‌آید.
  assert.doesNotMatch(stage, /<PreviewLoading label="در حال لود تصویر…"/);
  // دور ۷۷: MediaPlayer لودینگ خودش را دارد و مدال پردهٔ اضافه نمی‌سازد.
  assert.doesNotMatch(stage, /setImageReady/);
  assert.match(stage, /onLoad=\{\(\) => setDocumentReady\(true\)\}/);
  // مخزن پیش‌نمایش سریع هم همین رفتار را دارد.
  assert.match(quickPreview, /<ImagePreview/);
  assert.match(quickPreview, /onReady=\{\(\) => setMediaReady\(true\)\}/);
  assert.match(quickPreview, /onLoad=\{\(\) => setMediaReady\(true\)\}/);
});

test('the asset list keeps selection on the right and bulk actions on the right with delete', () => {
  // جدول: ستون انتخاب پیش از ستون‌های اطلاعات (سمت راست در RTL).
  assert.match(dam, /<thead><tr className="border-b border-slate-200 bg-slate-50\/90">\{canSelect && <th className="w-10 px-3 py-3 text-center">/);
  // ردیف فهرست: خانهٔ انتخاب نخستین خانهٔ شبکه است.
  assert.match(dam, /grid-cols-\[20px_minmax\(0,1fr\)_32px\]/);
  // کارت شبکه: انتخاب سمت راست، نشان محرمانگی سمت چپ.
  assert.match(dam, /className="absolute right-2\.5 top-2\.5 z-10 h-4 w-4/);
  // نوار اقدام همگانی: راست‌چین + دکمهٔ حذف (و بایگانی وضعیت، جدا از حذف).
  // دور ۷۹: عملیات گروهی در ابتدای ردیف (سمت راست) و «دانلود ZIP» هم همان‌جاست.
  assert.match(dam, /className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"/);
  assert.match(dam, /rounded-xl bg-indigo-50 px-2 py-1\.5/);
  assert.match(dam, /await request\('\/dam\/library\/bulk\/archive', \{ method: 'POST', body: \{ ids: selectedIds \} \}\);/);
  assert.match(dam, /onClick=\{\(\) => void deleteSelected\(\)\}[\s\S]{0,300}حذف<\/button>/);
  assert.match(dam, /statusOptions\.some\(option => option\.id === 'archived'\)[\s\S]{0,320}بایگانی/);
});
