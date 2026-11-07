import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۷۹: فیلتر نوع فایل، دانلود گروهی زیپ، پالایش پخش‌کننده و نام هوشمند خروجی.
 *
 * قراردادهای این دور:
 *  - فهرست دارایی‌ها فیلتر «نوع فایل» (تصویر/ویدیو/صدا/PDF/…) دارد و فیلتر سمت
 *    سرور اعمال می‌شود، نه فقط روی صفحهٔ جاری.
 *  - دارایی‌های انتخاب‌شده با یک دکمه به‌صورت زیپ دانلود می‌شوند.
 *  - نوار بلندی صدا تا هر جا لغزنده آمده رنگ می‌گیرد و منوی شناور شیشه‌ای است.
 *  - دکمهٔ پخش مرکز ویدیو در هر حالت «متوقف» دیده می‌شود.
 *  - نوع خروجی روی کارت، فرمت واقعی فایل یا «متن» است و متن خروجی کوتاه است.
 *  - نام نمایشی فایل خروجی هوشمند، کوتاه و یکتاست.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const dam = read('../src/components/dam/DamLibrary.tsx');
const player = read('../src/components/common/MediaPlayer.tsx');
const css = read('../src/index.css');
const stage = read('../src/components/content/StageAssetSections.tsx');
const composer = read('../src/components/common/AttachmentComposer.tsx');
const routes = read('../../backend/routes/api.php');
const controller = read('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php');
const kinds = read('../../backend/app/Support/Media/DamFileKind.php');
const zip = read('../../backend/app/Support/Media/DamZipStream.php');

test('فهرست دارایی‌ها فیلتر نوع فایل دارد و سمت سرور اعمال می‌شود', () => {
  // فهرست دسته‌ها و ارسال آن به سرور.
  assert.match(dam, /const FILE_KIND_OPTIONS = \[/);
  for (const kind of ['image', 'video', 'audio', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'archive', 'other']) {
    assert.match(dam, new RegExp(`\\{ value: '${kind}', label: '[^']+' \\}`));
  }
  assert.match(dam, /if \(fileKind\) params\.set\('file_kind', fileKind\);/);
  assert.match(dam, /ariaLabel="فیلتر نوع فایل"/);
  // در شمارش فیلترهای فعال هم می‌آید.
  assert.match(dam, /\{\[fileKind, categoryId, status, confidentiality/);

  // سرور: اعتبارسنجی و اعمال فیلتر.
  assert.match(kinds, /public const KINDS = \['image', 'video', 'audio', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'archive', 'other'\];/);
  assert.match(controller, /'file_kind' => \['nullable', Rule::in\(DamFileKind::KINDS\)\]/);
  assert.match(controller, /DamFileKind::apply\(\$query, \$data\['file_kind'\]\)/);
});

test('دارایی‌های انتخاب‌شده با یک دکمه به‌صورت زیپ دانلود می‌شوند', () => {
  // مسیر و اکشن سرور.
  assert.match(routes, /Route::post\('dam\/library\/bulk\/download', \[DamAssetController::class, 'bulkDownload'\]\)/);
  assert.match(controller, /public function bulkDownload\(Request \$request\)/);
  assert.match(controller, /abort_unless\(\$request->user\(\)->hasPermission\('assets\.download'\), 403\);/);
  assert.match(controller, /new DamZipStream\(\$entries, 'tadbir-assets-'/);

  // زیپ بدون نیاز به افزونهٔ zip ساخته می‌شود و هدرهای استاندارد دارد.
  assert.match(zip, /0x04034b50/);
  assert.match(zip, /0x02014b50/);
  assert.match(zip, /0x06054b50/);
  assert.match(zip, /hash_init\('crc32b'\)/);

  // دکمهٔ رابط کاربری + درخواست با کوکی و توکن CSRF.
  assert.match(dam, /async function downloadAssetsZip\(ids: number\[\]\)/);
  assert.match(dam, /'X-XSRF-TOKEN'/);
  assert.match(dam, /دانلود ZIP/);
  assert.match(dam, /const \[archiveBusy, setArchiveBusy\] = useState\(false\);/);
  // عملیات گروهی در ابتدای ردیف (راست) و امکان لغو انتخاب.
  assert.match(dam, /justify-between gap-2 border-t border-slate-100 pt-3/);
  assert.match(dam, /لغو انتخاب/);
});

test('نوار بلندی صدا تا محل لغزنده رنگ می‌گیرد و منو شیشه‌ای است', () => {
  // درصد پرشدن روی خودِ لغزنده ست می‌شود و در CSS رنگ می‌گیرد.
  assert.match(player, /const volumePercent = Math.round\(\(muted \? 0 : volume\) \* 100\);/);
  assert.match(player, /'--ui-volume-fill': `\$\{volumePercent\}%`/);
  assert.match(css, /\.ui-volume \{/);
  assert.match(css, /var\(--color-primary\) 0 var\(--ui-volume-fill, 0%\)/);
  // منوی شناور: شیشه‌ای با مات‌شدن پس‌زمینه.
  assert.match(player, /backdrop-blur-xl/);
  assert.match(player, /backdrop-saturate-150/);
  assert.match(player, /const volumeMenuClass = isVideo/);
});

test('دکمهٔ پخش مرکز ویدیو در حالت توقف دیده می‌شود', () => {
  assert.match(player, /isVideo && !failed && ready && !playing/);
  assert.match(player, /'ادامهٔ پخش ویدیو'/);
  // دکمهٔ شیشه‌ای مرکز.
  assert.match(player, /rounded-full border border-white\/40 bg-white\/25 text-white shadow-xl backdrop-blur-md/);
  // تا آماده‌شدن، نشانگر لودینگ به‌جای کادر سیاه.
  assert.match(player, /'در حال آماده‌سازی ویدیو…'/);
  assert.match(player, /'در حال بارگذاری ویدیو…'/);
});

test('نوع خروجی روی کارت، فرمت واقعی فایل یا «متن» است', () => {
  assert.match(stage, /export const stageAssetTypeLabel = \(view: StageAssetView, meta\?: \{/);
  assert.match(stage, /extension\?: string;/);
  assert.match(stage, /mimeType\?: string;/);
  assert.match(stage, /isTextAsset\?: boolean;/);
  // پسوند/MIME واقعی دارایی جای پسوند نامعلوم ردیف خروجی می‌نشیند.
  // دور ۸۶: `mimeOf` پسوندِ خالی مانند «mp4»/«pdf» را هم به MIME واقعی تبدیل
  // می‌کند؛ پیش‌تر چنین مقداری نه آیکون درست می‌گرفت و نه برچسب نوع فایل.
  assert.match(stage, /const mimeOf = \(view: StageAssetView\): string => \{/);
  assert.match(stage, /const mime = mimeOf\(\{ \.\.\.view, mimeType: view\.mimeType \|\| meta\?\.mimeType \}\);/);
  assert.match(stage, /const ext = extensionOf\(view\) \|\| \(meta\?\.extension \|\| ''\)\.toLowerCase\(\);/);
  // متن خروجی کوتاه نمایش داده می‌شود و فقط از خود ردیف خروجی می‌آید.
  // دور ۸۲: هیچ درخواستی برای متن دارایی از کارت فرستاده نمی‌شود.
  assert.match(stage, /const excerpt = textExcerpt\(view\);/);
  assert.match(stage, /raw\.length > 120/);
});

test('پیش‌نمایش «جدول اطلاعات» لودینگ دارد و از مات به شفاف می‌آید', () => {
  assert.match(stage, /canLoadAsset && tableRows\.isLoading && \(/);
  assert.match(stage, /aria-label="در حال خواندن اطلاعات ردیف"/);
  assert.match(stage, /در حال خواندن اطلاعات ردیف از خود جدول…/);
  assert.match(stage, /ui-skeleton h-3\.5/);
  assert.match(stage, /<div className="ui-clear-in space-y-3">/);
  assert.match(css, /@keyframes ui-clear-in \{[\s\S]{0,120}filter: blur\(6px\)/);
  // پرداخت تصویر: هیچ پردهٔ لودینگ اضافه‌ای روی `ImagePreview` نیست.
  assert.doesNotMatch(stage, /<PreviewLoading label="در حال لود تصویر…"/);
});

test('نام نمایشی فایل خروجی هوشمند و کوتاه پیشنهاد می‌شود', () => {
  // نام فایل بدون پسوند، با جداکنندهٔ یکسان و سقف ۳۲ نویسه.
  assert.match(composer, /const withoutExtension = file\.name\.replace/);
  assert.match(composer, /if \(normalized\.length <= 32\) return normalized;/);
  // پیشوند زمینه (کد محتوا) با جداکنندهٔ «·» می‌آید تا نام طولانی نشود.
  assert.match(composer, /const base = prefix \? `\$\{prefix\} · \$\{shortName\}` : shortName;/);
  // هم‌نامی: اول فرمت فایل، بعد شمارهٔ فارسی.
  assert.match(composer, /const withFormat = extension \? `\$\{base\} \(\$\{extension\}\)` : base;/);
  assert.match(composer, /candidate = `\$\{withFormat\} \$\{counter\.toLocaleString\('fa-IR'\)\}`;/);
});
