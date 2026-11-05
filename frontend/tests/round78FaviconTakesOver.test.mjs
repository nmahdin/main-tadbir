import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * دور ۷۸: فاوآیکونِ بارگذاری‌شده باید جای آیکون قبلی را در زبانهٔ مرورگر بگیرد.
 *
 * نشانه: فایل در تنظیمات بارگذاری می‌شد و پیش‌نمایش هم همان را نشان می‌داد، اما
 * زبانه هنوز آیکون قبلی را داشت. علت پیدا شد: لینک ثابتِ `index.html` با
 * `type="image/svg+xml"` اعلام شده و اسکریپتِ پیش از رندر فقط `href` را عوض
 * می‌کرد؛ مرورگر فایل PNG را با نوعِ اعلام‌شدهٔ SVG نمی‌پذیرفت، آیکون را رد
 * می‌کرد و همان آیکون قبلی روی تب می‌ماند. سه قاعدهٔ این دور:
 *
 *   ۱) نوعِ اعلام‌شده هیچ‌وقت با فایل ناسازگار نمی‌ماند (نوع حذف می‌شود و
 *      `Content-Type` پاسخ تعیین‌کننده است)؛
 *   ۲) در حافظهٔ مرورگر فقط نشانی‌ای کش می‌شود که واقعاً لود شده است؛
 *   ۳) آیکون روی همان لینکِ موجود سند عوض می‌شود تا تب بی‌آیکون نماند.
 */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('../src/utils/favicon.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const context = readFileSync(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');

test('سند اولیه فاوآیکون قدیمی را از حافظه برنمی‌گرداند', () => {
  assert.match(html, /data-tadbir-favicon="pending"/);
  assert.doesNotMatch(html, /localStorage\.getItem\('tadbir:brand-favicon'\)/);
});

test('فقط نشانی‌ای کش می‌شود که واقعاً لود شده است', () => {
  assert.match(favicon, /const FAVICON_STORAGE_KEY = 'tadbir:brand-favicon';/);
  assert.match(favicon, /const rememberFavicon = \(href: string \| null\): void => \{/);
  // در مسیر موفق (پس از لود شدن تصویر) نوشته می‌شود…
  const loadedAt = favicon.indexOf('rememberFavicon(href);');
  assert.ok(loadedAt > favicon.indexOf('link.href = href;'), 'کش باید بعد از نشستن آیکون انجام شود.');
  // …و در مسیرهای ناموفق/پیش‌فرض پاک می‌شود.
  assert.ok((favicon.match(/rememberFavicon\(null\);/g) || []).length >= 2);
  assert.match(favicon, /window\.localStorage\.setItem\(FAVICON_STORAGE_KEY, href\);/);
  assert.match(favicon, /window\.localStorage\.removeItem\(FAVICON_STORAGE_KEY\);/);
  // مقدار خام تنظیمات دیگر آن‌جا نوشته نمی‌شود.
  assert.doesNotMatch(app, /localStorage\.setItem\('tadbir:brand-favicon'/);
  assert.doesNotMatch(context, /setItem\('tadbir:brand-favicon'/);
});

test('آیکون روی لینک موجود سند عوض می‌شود، نه با حذف و ساخت لینک', () => {
  assert.match(favicon, /const iconSlot = \(\): HTMLLinkElement => \{/);
  assert.match(favicon, /existing\.filter\(node => node !== managed\)\.forEach\(node => node\.remove\(\)\);/);
  // هیچ‌جا همهٔ لینک‌ها پاک نمی‌شوند تا تب لحظه‌ای بی‌آیکون نشود.
  assert.doesNotMatch(favicon, /iconLinks\(\)\.forEach\(node => node\.remove\(\)\)/);
  assert.match(favicon, /link\.dataset\.tadbirFavicon = 'custom';/);
  assert.match(favicon, /if \(mime\) link\.type = mime;/);
  // نوع ناشناخته روی لینک نمی‌ماند؛ `Content-Type` پاسخ تعیین‌کننده است.
  assert.match(favicon, /else link\.removeAttribute\('type'\);/);
  assert.match(favicon, /link\.href = href;/);
  // لینک موجود نباید برای اعمال دوبارهٔ آیکون جابه‌جا شود.
  assert.match(favicon, /if \(link\.href !== href \|\| link\.dataset\.tadbirFavicon !== 'custom'\)/);
  assert.match(favicon, /v=\$\{versionOf\(value\)\}/);
});

test('خطای گذرا آیکون سفارشی را کنار نمی‌گذارد و نسخهٔ موبایل هم هم‌گام است', () => {
  assert.match(favicon, /if \(attempt === 1\) \{/);
  assert.match(favicon, /probe\.onerror = \(\) => \{/);
  assert.match(favicon, /if \(link\.dataset\.tadbirFavicon !== 'custom'\) holdNeutral\(link\);/);
  assert.match(favicon, /const APPLE_ICON = 'link\[rel="apple-touch-icon"\]';/);
  assert.match(favicon, /const mirrorAppleIcon = \(href: string\): void => \{/);
});
