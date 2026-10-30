import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * درخواست این دور: هنگام انتخاب دارایی از مخزن برای اتصال در بخش «ضمیمه‌ها»،
 * کاربر باید بتواند پیش از اتصال، پیش‌نمایش همان دارایی را ببیند.
 *
 * پیش‌نمایش از همان نقطهٔ انتخاب (فهرست مخزن و فهرست انتخاب‌شده‌ها) باز می‌شود،
 * کلیک آن تیک اتصال را عوض نمی‌کند، و قالب فایل از مسیر محافظت‌شدهٔ
 * `/dam/library/{id}/preview` می‌آید — بدون مجوز، پیام فارسی جای تصویر شکسته.
 */
test('پیش‌نمایش دارایی: دکمهٔ پیش‌نمایش در فهرست مخزن ضمیمه‌ها هست', async () => {
  const composer = await source('../src/components/common/AttachmentComposer.tsx');

  assert.match(composer, /import \{ DamAssetQuickPreview \} from '\.\.\/dam\/DamAssetQuickPreview';/);
  // دکمهٔ پیش‌نمایش برای هر ردیف مخزن، با برچسب دسترس‌پذیر.
  assert.match(composer, /aria-label=\{`پیش‌نمایش \$\{asset\.latest_file\?\.original_filename \|\| asset\.title\}`\}/);
  assert.match(composer, /onClick=\{\(\) => setPreviewAsset\(asset\)\}/);
  assert.match(composer, /title="پیش‌نمایش پیش از اتصال"/);
  // ردیف دیگر با `<label>` کل‌ناحیه‌ای پیچیده نشده تا کلیک پیش‌نمایش تیک را عوض نکند.
  assert.match(composer, /پیش‌نمایش، بیرون از label است تا کلیک آن تیک اتصال را عوض نکند/);
  // و در فهرست دارایی‌های انتخاب‌شده هم قابل مشاهده است.
  assert.match(composer, /aria-label=\{`پیش‌نمایش \$\{asset\.title\}`\}/);
  assert.match(composer, /<DamAssetQuickPreview/);
  assert.match(composer, /onToggleSelect=\{previewAsset \? \(\) => toggleLibraryAsset\(previewAsset\) : undefined\}/);
  // در بستر محتوا، عضو محتوا هم می‌تواند پیش‌نمایش دارایی‌های همان محتوا را ببیند (مثل صفحهٔ مخزن).
  assert.match(composer, /linkedContentAccess=\{Boolean\(linkTarget\?\.contentId\)\}/);
});

test('پیش‌نمایش دارایی: انتخاب از داخل پیش‌نمایش همان تابع تیک فهرست است', async () => {
  const composer = await source('../src/components/common/AttachmentComposer.tsx');

  assert.match(composer, /const toggleLibraryAsset = \(asset: AttachmentLibraryAsset, forceSelected\?: boolean\) => \{/);
  assert.match(composer, /onChange=\{\(\) => toggleLibraryAsset\(asset\)\}/);
});

test('پیش‌نمایش دارایی: قالب‌ها از مسیر محافظت‌شده و با پیام فارسی برای قالب‌های پشتیبانی‌نشده', async () => {
  const [preview, controller, routes] = await Promise.all([
    source('../src/components/dam/DamAssetQuickPreview.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
    source('../../backend/routes/api.php'),
  ]);

  // مسیر پیش‌نمایش همان چیزی است که سرور می‌دهد.
  assert.match(preview, /const src = `\$\{apiConfig\.baseUrl\}\/dam\/library\/\$\{asset\.id\}\/preview`;/);
  assert.match(preview, /apiConfig\.baseUrl\}\/dam\/library\/\$\{asset\.id\}\/download/);
  assert.match(routes, /Route::get\('dam\/library\/\{asset\}\/preview', \[DamAssetController::class, 'preview'\]\)/);
  // سرور هم فقط با مجوز پیش‌نمایش فایل را می‌دهد و قالب پشتیبانی‌نشده را ۴۱۵ می‌کند.
  assert.match(controller, /\$this->permitted\(\$request, 'assets\.preview', \$asset\);/);
  assert.match(controller, /abort_unless\(\$isPreviewable, 415/);

  // تصویر/صدا/ویدیو/PDF و متن ساده
  assert.match(preview, /const mimeKind = \(mime: string\): 'image' \| 'audio' \| 'video' \| 'document' \| 'other' => \{/);
  assert.match(preview, /if \(mime\.startsWith\('image\/'\) && mime !== 'image\/svg\+xml'\) return 'image';/);
  assert.match(preview, /if \(mime\.startsWith\('audio\/'\)\) return 'audio';/);
  assert.match(preview, /if \(mime\.startsWith\('video\/'\)\) return 'video';/);
  assert.match(preview, /if \(mime === 'application\/pdf' \|\| mime === 'text\/plain'\) return 'document';/);
  // اگر خود فایل بارگذاری نشد (۴۰۳/۴۱۵/حذف فایل) جای تصویر شکسته، پیام فارسی.
  assert.match(preview, /const showFailure = loadFailed && \(payload\.mode === 'image'/);
  assert.match(preview, /فایل پیش‌نمایش بارگذاری نشد؛/);
  // دارایی متنی مخزن (بدون فایل) متن ذخیره‌شده را نشان می‌دهد.
  assert.match(preview, /const isTextAsset = data\?\.type === 'content' \|\| asset\.type === 'content' \|\| Boolean\(data\?\.content_item\?\.content_body\);/);

  // بدون مجوز پیش‌نمایش، به‌جای پنجرهٔ خالی/شکسته پیام روشن.
  assert.match(preview, /hasPermission\('assets\.preview'\)/);
  assert.match(preview, /hasPermission\('assets\.download'\)/);
  assert.match(preview, /پیش‌نمایش محتوای فایل/);
  assert.match(preview, /پیش‌نمایش مستقیم قالب/);
  // پیش‌نمایش هرگز فایل را تکثیر یا پیوست نمی‌کند.
  assert.match(preview, /فایل تکثیر نمی‌شود و اتصال پس از ذخیرهٔ فرم انجام می‌شود/);
});
