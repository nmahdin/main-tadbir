import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/**
 * دور ۷۳: لود شدن لوگو/فاوآیکون و عکس‌های پروفایل، و پیام موفقیتِ اتصال بله.
 *
 * قراردادهای این دور را قفل می‌کند تا دوباره به حالت «تصویر شکسته» برنگردیم:
 * مسیر رسانه از خودِ API سرو می‌شود (نه `/storage` وابسته به لینک نمادین)،
 * لوگو/فاوآیکون با همان لودر تصویر مشترک و جایگزین خطا رندر می‌شوند، فاوآیکون
 * نسخه‌دار است و ربات بله پس از پذیرش کد، پیام موفقیت می‌فرستد.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const mediaUrl = read('../src/utils/mediaUrl.ts');
const brandLogo = read('../src/components/common/BrandLogo.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');
const authModal = read('../src/components/auth/AuthModal.tsx');
const settingsView = read('../src/components/settings/SettingsView.tsx');
const app = read('../src/App.tsx');
const smartImage = read('../src/components/common/SmartImage.tsx');

const publicMedia = read('../../backend/app/Support/Media/PublicMedia.php');
const mediaController = read('../../backend/app/Http/Controllers/Api/V1/PublicMediaController.php');
const apiRoutes = read('../../backend/routes/api.php');
const menuRouter = read('../../backend/app/Bot/Bale/Routing/MenuRouter.php');
const settingController = read('../../backend/app/Http/Controllers/Api/V1/SystemSettingController.php');
const userResource = read('../../backend/app/Http/Resources/UserResource.php');

test('server media files are served by the API itself, not the /storage symlink', () => {
  // روی هاست اشتراکی `php artisan storage:link` اجرا نمی‌شود؛ مسیر `/storage`
  // ۴۰۴ بود و همهٔ عکس‌های پروفایل و لوگو شکسته نمایش داده می‌شدند.
  assert.match(publicMedia, /public const DIRECTORIES = \['avatars', 'brand'\]/);
  assert.match(publicMedia, /public static function url\(mixed \$value\): string/);
  assert.match(publicMedia, /'\/api\/v1\/media\/'/);
  assert.match(mediaController, /Storage::disk\('public'\)/);
  assert.match(mediaController, /abort_if\(\$safe === null, 404\);/);
  assert.match(apiRoutes, /Route::get\('media\/\{path\}', \[PublicMediaController::class, 'show'\]\)/);
  assert.match(apiRoutes, /->where\('path', '\.\*'\)/);
  assert.match(userResource, /'avatar' => PublicMedia::url\(\$this->avatar\)/);
  // لوگو/فاوآیکون هم در خواندنِ تنظیمات به نشانی مطلق تبدیل می‌شوند.
  assert.match(settingController, /private function exposeMediaUrls\(array \$value\): array/);
  assert.match(settingController, /foreach \(\['logoUrl', 'faviconUrl'\] as \$key\)/);
});

test('the panel rewrites stored media paths onto the API media route', () => {
  assert.match(mediaUrl, /export const mediaBase = \(\): string =>/);
  assert.match(mediaUrl, /const MEDIA_FILE = \/\^\(avatars\|brand\)/);
  assert.match(mediaUrl, /if \(file\) return `\$\{mediaBase\(\)\}\/\$\{file\}`;/);
  // نشانی‌های کامل بیرونی (مثل تصویر نمونه) دست‌نخورده می‌مانند.
  assert.ok(mediaUrl.includes('blob:|data:|file:'), 'inline preview URLs must pass through');
  assert.ok(mediaUrl.includes("return value.startsWith('//') ? `https:${value}` : value;"), 'absolute URLs pass through');
  assert.ok(mediaUrl.includes('SERVER_PATHS.some'), 'other server prefixes still resolve against the API origin');
});

test('logo, favicon and the settings previews use the shared image loader', () => {
  assert.ok(existsSync(new URL('../src/components/common/BrandLogo.tsx', import.meta.url)));
  assert.match(brandLogo, /<SmartImage/);
  assert.match(brandLogo, /src=\{mediaUrl\(url\)\}/);
  // کادر شکستهٔ مرورگر هرگز دیده نمی‌شود: جایگزین و لودر مشترک.
  assert.match(smartImage, /phase === 'error'/);

  for (const [name, source] of [['Sidebar', sidebar], ['AuthModal', authModal]]) {
    assert.match(source, /import \{ BrandLogo \} from '\.\.\/common\/BrandLogo';/, `${name} must use BrandLogo`);
    assert.match(source, /<BrandLogo/, `${name} must render BrandLogo`);
    assert.doesNotMatch(source, /<img src=\{mediaUrl\(generalSettings\.logoUrl\)\}/, `${name} still renders a raw logo img`);
  }

  assert.match(settingsView, /import \{ BrandLogo \} from '\.\.\/common\/BrandLogo';/);
  assert.match(settingsView, /fallback=\{<ImageIcon className="w-5 h-5 text-slate-400" \/>\}/);
});

test('the browser favicon is versioned, typed and keeps the default on failure', () => {
  assert.match(app, /import \{ mediaUrl \} from '\.\/utils\/mediaUrl';/);
  assert.match(app, /link\.rel = 'icon';/);
  assert.match(app, /if \(mime\) link\.type = mime;/);
  assert.match(app, /'\?'\}v=\$\{version\}/);
  // با خطای فایل، آیکون سفارشی برداشته می‌شود و پیش‌فرض می‌ماند.
  assert.match(app, /probe\.onerror = \(\) => \{/);
  assert.match(app, /document\.querySelectorAll<HTMLLinkElement>\(selector\)/);
});

test('the Bale bot confirms a successful link instead of silently showing a menu', () => {
  assert.match(menuRouter, /\$linkedNow = \$link !== null;/);
  assert.match(menuRouter, /if \(\$linkedNow\) \{/);
  assert.match(menuRouter, /private function linkSucceeded\(string \$key, string \$chat, BaleUserLink \$link\): void/);
  assert.match(menuRouter, /✅ حساب بله شما با موفقیت به تدبیر متصل شد/);
  assert.match(menuRouter, /\$this->homeRows\(\$user, \$link\)/);
  // پیام موفقیت پیش از هر مسیریابی دیگری برمی‌گردد.
  assert.match(menuRouter, /\$this->linkSucceeded\(\$key, \$chat, \$link\);[\s\S]{0,40}return;/);
});
