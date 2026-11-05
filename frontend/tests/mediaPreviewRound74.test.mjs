import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/**
 * دور ۷۴: نمایش کامل تصویر، لود پیش از محتوا، پیش‌نمایش کارت خروجی‌ها، و
 * پخش‌کنندهٔ اختصاصی صدا/ویدیو با بارگیری وابسته به پخش.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const mediaPlayer = read('../src/components/common/MediaPlayer.tsx');
const imagePreview = read('../src/components/common/ImagePreview.tsx');
const smartImage = read('../src/components/common/SmartImage.tsx');
const stageSections = read('../src/components/content/StageAssetSections.tsx');
const quickPreview = read('../src/components/dam/DamAssetQuickPreview.tsx');
const damLibrary = read('../src/components/dam/DamLibrary.tsx');
const assetHook = read('../src/hooks/useDamAssetDetail.ts');
const damController = readFileSync(new URL('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php', import.meta.url), 'utf8');

test('images are shown whole, never cropped, in both preview surfaces', () => {
  // حالت `contain` در لودر مشترک: اندازهٔ طبیعی، محدود به کادر و بدون بریدن.
  assert.match(smartImage, /fit\?: 'cover' \| 'contain';/);
  assert.match(smartImage, /fit === 'contain'/);
  assert.match(smartImage, /h-auto w-auto max-h-full max-w-full object-contain/);

  assert.ok(existsSync(new URL('../src/components/common/ImagePreview.tsx', import.meta.url)));
  assert.match(imagePreview, /fit="contain"/);
  // اندازهٔ واقعی با اسکرول هم ممکن است.
  assert.match(imagePreview, /setMode\(previous => \(previous === 'fit' \? 'actual' : 'fit'\)\)/);
  assert.match(imagePreview, /نمایش اندازهٔ کامل/);
  assert.match(imagePreview, /ui-skeleton absolute inset-0/);
  assert.match(imagePreview, /در حال لود تصویر…/);

  // هر دو سطح پیش‌نمایش از همین کامپوننت استفاده می‌کنند.
  assert.match(stageSections, /<ImagePreview\s+src=\{payload\.src\}\s+alt=\{view\.title\}/);
  assert.match(quickPreview, /<ImagePreview/);
  assert.match(damLibrary, /return <ImagePreview src=\{src\}/);
  // دیگر پیش‌نمایش تصویر با ارتفاع ثابت ۸۰ پیکسلی بریده نمی‌شود.
  assert.doesNotMatch(damLibrary, /h-80 w-full rounded-2xl border border-slate-200" imgClassName="object-contain"/);
});

test('the preview modal shows a loader before anything else, never the raw address', () => {
  // تا رسیدن جزئیات دارایی، حالت `loading` است؛ آدرس/پیوند خام نمایش داده نمی‌شود.
  assert.match(stageSections, /\| \{ mode: 'loading' \}/);
  assert.match(stageSections, /const waitingForAsset = Boolean\(assetId && canLoadAsset && !asset\.data && !asset\.isError\);/);
  assert.match(stageSections, /waitingForAsset \? \{ mode: 'loading' \} : inlinePayload\(view\)/);
  assert.match(stageSections, /\{payload\.mode === 'loading' && <PreviewSkeleton \/>\}/);
  // اسکلت متنی پیش از رسیدن متن هم نمایش داده می‌شود.
  assert.match(stageSections, /در حال دریافت پیش‌نمایش…/);
});

test('registered output cards preview their content under the title', () => {
  // برای متن، بخشی از متن و برای تصویر، بخشی از تصویر.
  assert.match(stageSections, /inlineExcerpt\s*\|\|\s*\(assetText\.data\?\.content_item\?\.content_body/);
  assert.match(stageSections, /const needsAssetText = Boolean\(view\.assetId\) && !isImage && !inlineExcerpt/);
  assert.match(stageSections, /useDamAssetDetail\(view\.assetId, needsAssetText\)/);
  assert.match(stageSections, /line-clamp-3 block whitespace-pre-wrap rounded-xl bg-slate-50/);
  // تصویر کارت هم با کادر ثابت و بدون پرش چیدمان.
  assert.match(stageSections, /className="mt-1 h-36 w-full rounded-xl border border-slate-200"/);
  // تشخیص تصویر از قالب/MIME خروجی، نه فقط پسوند آدرس.
  assert.match(stageSections, /if \(view\.outputType === 'image'\) return true;/);
  assert.match(stageSections, /startsWith\('image\/'\)/);
  // لودینگ متن کارت تا رسیدن بدنه از مخزن.
  assert.match(stageSections, /needsAssetText && assetText\.isLoading/);
  // کش مشترک کارت و مدال: باز کردن پیش‌نمایش درخواست تازه نمی‌فرستد.
  assert.match(assetHook, /queryKey: \['dam-asset', 'preview', assetId\]/);
});

test('audio and video get a dedicated player whose loading follows playback', () => {
  assert.ok(existsSync(new URL('../src/components/common/MediaPlayer.tsx', import.meta.url)));
  // تا قصد کاربر هیچ بایتی گرفته نمی‌شود؛ با پخش، بارگیری خودکار و با توقف، قطع.
  assert.match(mediaPlayer, /const \[preload, setPreload\] = useState<'none' \| 'metadata' \| 'auto'>\('none'\);/);
  assert.match(mediaPlayer, /if \(playing\) \{\s*setPreload\('auto'\);/);
  assert.match(mediaPlayer, /pauseTimer\.current = window\.setTimeout\(\(\) => setPreload\('none'\), 600\);/);
  assert.match(mediaPlayer, /const warmUp = \(\) => \{[\s\S]{0,120}setPreload\('metadata'\)/);

  // کنترل‌های اختصاصی: پخش/توقف، نوار زمان با بازهٔ بارگیری‌شده، صدا، سرعت، تمام‌صفحه.
  assert.match(mediaPlayer, /role="slider"/);
  assert.match(mediaPlayer, /aria-valuetext=\{clock\(current\)\}/);
  assert.match(mediaPlayer, /toggleFullscreen/);
  assert.match(mediaPlayer, /RATES = \[1, 1\.25, 1\.5, 2, 0\.75\]/);
  assert.match(mediaPlayer, /بارگیری فایل همراه پخش انجام می‌شود/);

  // همهٔ پیش‌نمایش‌های رسانه از همین پخش‌کننده استفاده می‌کنند.
  assert.match(stageSections, /<MediaPlayer[\s\S]{0,120}kind=\{payload\.media\}/);
  assert.match(quickPreview, /<MediaPlayer[\s\S]{0,120}kind=\{payload\.media\}/);
  assert.match(damLibrary, /return <MediaPlayer src=\{src\} kind="audio"/);
  assert.match(damLibrary, /return <MediaPlayer src=\{src\} kind="video"/);
  // پخش‌کنندهٔ پیش‌فرض مرورگر دیگر استفاده نمی‌شود.
  assert.doesNotMatch(stageSections, /<audio|<video/);
  assert.doesNotMatch(quickPreview, /<audio|<video/);
});

test('the server answers byte ranges and logs one preview per visit', () => {
  assert.match(damController, /'Accept-Ranges' => 'bytes'/);
  assert.match(damController, /return response\(\)->file\(\$absolute, \$headers\);/);
  // پخش‌کننده برای هر جابه‌جایی درخواست بازه‌ای می‌فرستد؛ فعالیت تکراری ثبت نمی‌شود.
  assert.match(damController, /if \(! \$request->headers->has\('Range'\)\) \{/);
  // نام فارسی فایل با filename* و نسخهٔ ASCII با filename ارسال می‌شود.
  assert.ok(damController.includes("filename*=UTF-8\\'\\'%s"), 'utf-8 filename parameter');
});
