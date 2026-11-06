import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۷۶: پخش‌کنندهٔ صدا/ویدیو، کش تصویر پیش‌نمایش و کارت‌های خروجی.
 *
 * قراردادهای این دور:
 *  - دکمهٔ پخش/توقف هم در نوار پایین هست و هم در مرکز ویدیو؛ در حالت توقف،
 *    ویدیو هرگز بدون دکمهٔ پخش نمی‌ماند.
 *  - نوار کنترل چند ثانیه پس از شروع پخش خودکار پنهان می‌شود.
 *  - ویدیو پیش از آماده‌شدن، نشانگر لودینگ دارد.
 *  - بلندی صدا با منوی شناور (بی‌صدا + لغزنده) تنظیم می‌شود و دکمهٔ سرعت گرد/مربع
 *    است.
 *  - تمام‌صفحه واقعاً تمام صفحه می‌شود.
 *  - تصویری که یک‌بار لود شده، در باز‌کردن دوبارهٔ مدال دیگر «در حال بارگذاری»
 *    نشان نمی‌دهد.
 *  - نوع خروجی روی کارت نوشته می‌شود (فرمت فایل یا «متن»).
 *  - بندانگشتی تصویر کارت خروجی با نشانی درست (مسیر API) لود می‌شود.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const player = read('../src/components/common/MediaPlayer.tsx');
const css = read('../src/index.css');
const smart = read('../src/components/common/SmartImage.tsx');
const imagePreview = read('../src/components/common/ImagePreview.tsx');
const preload = read('../src/utils/imagePreload.ts');
const stage = read('../src/components/content/StageAssetSections.tsx');
const mediaUrl = read('../src/utils/mediaUrl.ts');

test('پخش/توقف هم در نوار پایین هست و هم در مرکز ویدیو', () => {
  // نوار کنترل: دکمهٔ پخش/توقف با برچسب روشن برای صفحه‌خوان.
  assert.match(player, /aria-label=\{playing \? 'توقف پخش' : 'شروع پخش'\}/);
  // مرکز ویدیو: در حالت توقف دکمهٔ بزرگ پخش/ادامه دیده می‌شود.
  assert.match(player, /aria-label=\{current > 0 \? 'ادامهٔ پخش ویدیو' : 'پخش ویدیو'\}/);
  // دور ۷۹: در هر حالت «متوقف» (نه فقط پیش از شروع) دکمهٔ مرکز دیده می‌شود.
  assert.match(player, /isVideo && !failed && ready && !playing/);
  assert.match(player, /\{current > 0 \? 'ادامهٔ پخش' : 'پخش ویدیو'\}/);
});

test('نوار کنترل هنگام پخش خودکار پنهان می‌شود و با حرکت نشانگر برمی‌گردد', () => {
  assert.match(player, /const CONTROLS_HIDE_MS = 2600;/);
  assert.match(player, /window\.setTimeout\(\(\) => setControlsVisible\(false\), CONTROLS_HIDE_MS\)/);
  assert.match(player, /onPointerMove=\{revealControls\}/);
  // دور ۸۳: تا اولین فریم نیامده، نوار کنترل هم پنهان است.
  assert.match(player, /data-visible=\{isVideo \? \(verticalReady && controlsVisible \? 'true' : 'false'\) : 'true'\}/);
  assert.match(player, /verticalReady && controlsVisible \? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'/);
  // در حالت توقف یا هنگام کشیدن نوار/باز بودن منوی صدا پنهان نمی‌شود.
  // نشانگرِ روی نوار کنترل یا منوی صدا باز، پنهان‌شدن را متوقف می‌کند.
  assert.match(player, /if \(!playing \|\| dragging \|\| volumeOpen \|\| controlsPinned\) return;/);
});

test('ویدیو پیش از آماده‌شدن نشانگر لودینگ دارد', () => {
  assert.match(player, /isVideo && !failed && !ready/);
  assert.match(player, /در حال بارگذاری ویدیو…/);
  // دور ۸۳: جانمای لودینگ هم‌اندازهٔ پخش‌کننده با اسکلت روشن (نه کادر سیاه).
  assert.match(player, /aria-label="در حال آماده‌سازی پخش‌کنندهٔ ویدیو"/);
  assert.match(player, /ui-skeleton h-full w-full absolute inset-0/);
  assert.match(player, /isVideo && playing && buffering/);
});

test('بلندی صدا منوی شناور دارد و دکمهٔ سرعت مربع/گرد است', () => {
  assert.match(player, /aria-label="بلندی صدا"/);
  assert.match(player, /aria-haspopup="dialog"/);
  assert.match(player, /role="dialog"[\s\S]{0,200}aria-label="تنظیم بلندی صدا"/);
  assert.match(player, /type="range"/);
  assert.match(player, /aria-label="میزان بلندی صدا"/);
  assert.match(player, /onChange=\{event => applyVolume\(Number\(event\.target\.value\) \/ 100\)\}/);
  assert.match(player, /بی‌صدا کردن/);
  // دکمهٔ سرعت: کادر ۳۲ پیکسلی با گوشهٔ گرد (مربع/گرد)، نه متن لخت.
  assert.match(player, /flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-\[10px\] font-black/);
  assert.match(css, /\.ui-volume \{/);
  assert.match(css, /\.ui-volume::-webkit-slider-thumb/);
});

test('تمام‌صفحه واقعاً کل صفحه را پر می‌کند', () => {
  // کادر ویدیو پیش از معلوم‌شدن ابعاد هم نسبت ثابت دارد (۱۶:۹) تا نلرزد.
  assert.match(player, /fullscreen \? 'h-full w-full max-h-none' : 'h-full w-full'/);
  assert.match(player, /aspect-video w-full max-h-\[62dvh\]/);
  assert.match(player, /ui-media-stage/);
  assert.match(player, /webkitEnterFullscreen/);
  assert.match(css, /\.ui-media-stage:fullscreen video \{[\s\S]{0,160}max-height: none;/);
  assert.match(css, /\.ui-media-stage:fullscreen \{[\s\S]{0,160}border-radius: 0;/);
});

test('تصویرِ لود‌شده در باز‌کردن دوبارهٔ مدال دوباره «در حال بارگذاری» نمی‌شود', () => {
  assert.match(preload, /export function markImageLoaded/);
  assert.match(preload, /export function isImageLoaded/);
  assert.match(preload, /const loaded = new Set<string>\(\);/);
  // لودر مشترک تصویر، وضعیت اولیه را از حافظهٔ نشست می‌گیرد.
  assert.match(smart, /url \? \(isImageLoaded\(url\) \? 'ready' : 'loading'\) : 'error'/);
  assert.match(smart, /markImageLoaded\(url\)/);
  // پیش‌نمایش تصویر هم از همان حافظه استفاده می‌کند.
  assert.match(imagePreview, /useState\(\(\) => isImageLoaded\(src\)\)/);
  assert.match(imagePreview, /setReady\(isImageLoaded\(src\)\)/);
  // پردهٔ لودینگ مدال محتوا برای تصویرِ کش‌شده اصلاً رندر نمی‌شود.
  // دور ۷۷: لودینگ تصویر فقط از خودِ `ImagePreview` می‌آید (باکس اضافی حذف شد).
  assert.doesNotMatch(stage, /<PreviewLoading label="در حال لود تصویر…"/);
  assert.match(imagePreview, /ui-skeleton absolute inset-0/);
  assert.match(imagePreview, /در حال لود تصویر…/);
});

test('نوع خروجی روی کارت نوشته می‌شود: فرمت فایل یا «متن»', () => {
  assert.match(stage, /export const stageAssetTypeLabel = \(view: StageAssetView, meta\?: \{/);
  assert.match(stage, /if \(view\.dataTable\) return 'جدول اطلاعات';/);
  assert.match(stage, /if \(view\.outputType === 'text' \|\| meta\?\.isTextAsset\) return 'متن';/);
  assert.match(stage, /const EXT_LABEL: Record<string, string> = \{/);
  assert.match(stage, /pdf: 'PDF', doc: 'Word', docx: 'Word'/);
  assert.match(stage, /return `فایل \$\{EXT_LABEL\[ext\] \|\| ext\.toUpperCase\(\)\}`;/);
  // نشان روی کارت و در سربرگ مدال پیش‌نمایش.
  assert.match(stage, /\{stageAssetTypeLabel\(view\)\}/);
});

test('کارت خروجی تصویر را فقط در مدال پیش‌نمایش لود می‌کند', () => {
  // مسیرهای نسبی API و مسیرهای ذخیره‌شده باید به میزبان درست بروند (همان
  // کمکی که خود مدال برای ساخت نشانی تصویر استفاده می‌کند).
  assert.match(mediaUrl, /export function apiResourceUrl/);
  assert.match(mediaUrl, /if \(file\) return `\$\{mediaBase\(\)\}\/\$\{file\}`;/);
  // دور ۸۲: کارت خروجی هیچ تصویری نمی‌گیرد؛ نشانی پیش‌نمایش فقط در مدال
  // ساخته می‌شود و فقط وقتی کاربر آن را باز کند.
  assert.doesNotMatch(stage, /damApi\.library\.previewUrl\(view\.assetId\)/);
  assert.match(stage, /const asset = useDamAssetDetail\(assetId, canLoadAsset\);/);
  assert.match(stage, /waitingForAsset \? \{ mode: 'loading' \} : inlinePayload\(view\)/);
});
