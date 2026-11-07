import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۸۴ — نوار تب تقویم، نمایش محتوای منتشرشده و بهینه‌سازی بندانگشتی مخزن.
 */
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const calendar = read('../src/components/projects/ProjectCalendarView.tsx');
const dam = read('../src/components/dam/DamLibrary.tsx');
const thumbnail = read('../src/components/dam/AssetThumbnail.tsx');
const damApi = read('../src/api/dam.ts');
const routes = read('../../backend/routes/api.php');
const controller = read('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php');
const service = read('../../backend/app/Support/Media/DamThumbnail.php');
const middleware = read('../../backend/app/Http/Middleware/ConditionalJsonCache.php');
const bootstrap = read('../../backend/bootstrap/app.php');

test('نوار تب تقویم سفید است و تب فعال رنگ اصلی سامانه را دارد', () => {
  // پس‌زمینهٔ کل قسمت تب سفید.
  assert.match(calendar, /rounded-2xl border border-slate-200 bg-white p-1\.5 shadow-2xs/);
  // تب فعال: رنگ اصلی سامانه (`bg-indigo-600` به `--color-primary` نگاشت شده است).
  // دور ۹۵: رنگ اصلی سامانه روی نشانگر متحرک است؛ تب فعال فقط متن سفید می‌گیرد.
  assert.match(calendar, /const eventTabs = useSlidingTabs\(filter\);/);
  assert.match(calendar, /data-tab-active=\{active\}/);
  assert.match(calendar, /active \? 'text-white' : 'text-slate-400'/);
  // تب غیرفعال: بدون پس‌زمینه و بدون حاشیه، هاور کم‌رنگ.
  assert.match(calendar, /'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'/);
  assert.doesNotMatch(calendar, /bg-slate-100\/70 p-1\.5/);
});

test('محتوای منتشرشده هم روی تقویم دیده می‌شود', () => {
  // تاریخ کارت: انتشار → انتشارِ برنامه‌ریزی‌شده → مهلت → آخرین تغییر.
  assert.match(calendar, /const publishDate = pick\(content\.publishInfo\?\.date\);/);
  assert.match(calendar, /const scheduledDate = pick\(\(content\.publishInfo as \{ scheduledDate\?: string \} \| undefined\)\?\.scheduledDate\);/);
  assert.match(calendar, /const deadline = pick\(content\.deadline\);/);
  assert.match(calendar, /const fallback = pick\(content\.updatedAt \|\| content\.createdAt\);/);
  assert.match(calendar, /const date = publishDate \|\| scheduledDate \|\| deadline \|\| fallback;/);
  // مهلت تولید حذف نمی‌شود؛ در توضیح همان کارت می‌آید.
  assert.match(calendar, /مهلت تولید: \$\{deadline\}/);
  // هنوز دقیقاً یک کارت برای هر محتوا.
  assert.match(calendar, /id: `content-\$\{content\.id\}`,/);
  assert.doesNotMatch(calendar, /content-publish-/);
});

test('کارت و ردیف مخزن نسخهٔ کوچک تصویر را می‌گیرند، نه فایل اصلی', () => {
  assert.match(damApi, /thumbnailUrl\(id: string \| number, width: 96 \| 160 \| 320 \| 640 = 320\)/);
  assert.match(damApi, /\/dam\/library\/\$\{id\}\/thumbnail\?w=\$\{width\}/);
  // کارت شبکه‌ای مخزن: نسخهٔ ۳۲۰ پیکسلی.
  assert.match(dam, /const thumbSrc = isImage \? damApi\.library\.thumbnailUrl\(asset\.id, 320\) : '';/);
  assert.match(dam, /<SmartImage src=\{thumbSrc\}/);
  // ردیف ۴۰ پیکسلی: نسخهٔ ۹۶ پیکسلی؛ دارایی نمایشی همان نشانی خودش را دارد.
  assert.match(thumbnail, /damApi\.library\.thumbnailUrl\(numericId, size === 'sm' \? 96 : 320\)/);
  assert.match(thumbnail, /\/\^\\d\+\$\/\.test\(String\(asset\.id\)\)/);
  assert.match(thumbnail, /const imageSrc = sizedThumbnail \|\| asset\.thumbnailUrl \|\| asset\.url;/);
  // پیش‌بارگذاری فایل کامل با هاور حذف شد (فقط مدال آن را می‌گیرد).
  assert.doesNotMatch(dam, /imageIntentProps/);
});

test('سرور بندانگشتی کش‌شدهٔ تصویر را با هدرهای کش سرو می‌کند', () => {
  assert.match(routes, /Route::get\('dam\/library\/\{asset\}\/thumbnail', \[DamAssetController::class, 'thumbnail'\]\);/);
  assert.match(controller, /public function thumbnail\(Request \$request, DamAsset \$asset\)/);
  assert.match(controller, /\$this->permitted\(\$request, 'assets\.preview', \$asset\);/);
  assert.match(controller, /415,/);
  assert.match(controller, /private, max-age=604800/);
  assert.match(controller, /'ETag' => \$etag/);
  // ساخت نسخهٔ کوچک: Imagick و در نبود آن GD؛ بدون هیچ‌کدام فایل اصلی.
  assert.match(service, /public const WIDTHS = \[96, 160, 320, 640\];/);
  assert.match(service, /class_exists\(\\Imagick::class\)/);
  assert.match(service, /imagecreatefromstring/);
  assert.match(service, /return null;/);
});

test('پاسخ‌های GET با ETag اعتبارسنجی می‌شوند و درخواست بدون تغییر ۳۰۴ می‌گیرد', () => {
  assert.match(bootstrap, /ConditionalJsonCache::class/);
  assert.match(middleware, /if \(! \$request->is\('api\/\*'\) \|\| ! \$request->isMethodCacheable\(\)\)/);
  assert.match(middleware, /if \(! \$response instanceof JsonResponse \|\| \$response->getStatusCode\(\) !== 200\)/);
  assert.match(middleware, /\$etag = '"'\.sha1\(\$content\)\.'"';/);
  assert.match(middleware, /private, no-cache/);
  // پاسخ‌هایی که خودشان no-store اعلام کرده‌اند دست‌نخورده می‌مانند.
  assert.match(middleware, /str_contains\(strtolower\(\(string\) \$response->headers->get\('Cache-Control'\)\), 'no-store'\)/);
  assert.match(middleware, /Response::HTTP_NOT_MODIFIED/);
});
