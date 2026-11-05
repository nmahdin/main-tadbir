import { runtime } from '../config/runtime';

/**
 * نشانی رسانه‌های ذخیره‌شده در سرور (عکس پروفایل، لوگو، فاویکون).
 *
 * چرا این تبدیل لازم است: سرور مسیرهایی مثل `/storage/avatars/…` را ذخیره
 * می‌کند و این مسیر نسبت به **میزبان API** معنا دارد، نه میزبان پنل. در
 * استقرار واقعی این دو دامنه جدا هستند (`api-…` و پنل) و مهم‌تر اینکه پوشهٔ
 * `public/storage` روی هاست اشتراکی بدون اجرای `php artisan storage:link`
 * ساخته نمی‌شود؛ نتیجه‌اش تصویرهای شکسته بود.
 *
 * از این پس تصویرها از مسیر خودِ اپلیکیشن (`/api/v1/media/…`) خوانده می‌شوند
 * که نه به لینک نمادین وابسته است و نه به دامنهٔ پنل. اگر مقدار قدیمی
 * `/storage/…` (نسبی یا مطلق روی دامنهٔ پنل) در کش یا دادهٔ نمونه مانده باشد،
 * همین‌جا به مسیر جدید برگردانده می‌شود.
 */
export const apiOrigin = (): string => {
  const configured = runtime.apiUrl || '';
  if (/^https?:\/\//i.test(configured)) {
    try {
      return new URL(configured).origin;
    } catch {
      return '';
    }
  }
  return '';
};

/** ریشهٔ مسیر رسانه: در تولید روی دامنهٔ API و در توسعه همان پروکسی نسبی. */
export const mediaBase = (): string => `${(runtime.apiUrl || '/api/v1').replace(/\/+$/, '')}/media`;

const MEDIA_FILE = /^(avatars|brand)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** مسیر فایل رسانه را از هر شکلی که آمده بیرون می‌کشد. */
const mediaPath = (value: string): string => {
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      path = new URL(value).pathname;
    } catch {
      return '';
    }
  }
  path = path.replace(/^\/+/, '').replace(/^api\/v1\/media\//, '').replace(/^storage\//, '');
  return MEDIA_FILE.test(path) ? path : '';
};

const SERVER_PATHS = ['/storage/', '/brand/', '/avatars/', '/uploads/', '/media/'];

/** مسیر نسبیِ سرور را به نشانی کامل تبدیل می‌کند؛ نشانی‌های کامل و blob دست‌نخورده می‌مانند. */
export function mediaUrl(raw?: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (/^(blob:|data:|file:)/i.test(value)) return value;

  // مسیر فایل‌های عمومی سامانه (پروفایل/برند) همیشه از مسیر اپلیکیشن سرو می‌شود.
  const file = mediaPath(value);
  if (file) return `${mediaBase()}/${file}`;

  if (/^(https?:)?\/\//i.test(value)) return value.startsWith('//') ? `https:${value}` : value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (SERVER_PATHS.some(prefix => normalized.startsWith(prefix))) {
    return `${apiOrigin()}${normalized}`;
  }
  return normalized;
}

/** نوع MIME فاوآیکون سفارشی از پسوند فایل؛ مرورگر بدون آن هم حدس می‌زند. */
export function faviconType(url: string): string {
  const lowered = (url.split('?')[0] || '').toLowerCase();
  if (lowered.endsWith('.png')) return 'image/png';
  if (lowered.endsWith('.webp')) return 'image/webp';
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.svg')) return 'image/svg+xml';
  if (lowered.endsWith('.ico')) return 'image/x-icon';
  return '';
}

/**
 * نشانی یک منبع خودِ API (مثل `/api/v1/dam/library/12/preview`) را کامل می‌کند.
 *
 * چرا جدا از `mediaUrl`: مسیرهای زیر `/api/v1/…` روی دامنهٔ API معنا دارند و
 * اگر نسبت به دامنهٔ پنل خوانده شوند ۴۰۴ می‌شوند؛ در کارت‌های خروجی هم همین
 * اتفاق می‌افتاد و بندانگشتی تصویر هرگز نمایش داده نمی‌شد. مسیرهای نسبی در
 * توسعه دست‌نخورده می‌مانند (پروکسی Vite) و در تولید به میزبان API می‌روند.
 */
export function apiResourceUrl(raw?: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (/^(blob:|data:|file:)/i.test(value)) return value;
  if (/^(https?:)?\/\//i.test(value)) return mediaUrl(value);
  const path = value.startsWith('/') ? value : `/${value}`;
  if (/^\/(api\/v1|storage|media|uploads|brand|avatars)\//.test(path)) {
    const origin = apiOrigin();
    // مسیر `/storage/…` و `/api/v1/media/…` یک مقصد دارند: رسانهٔ خود API.
    const file = mediaPath(value);
    if (file) return `${mediaBase()}/${file}`;
    return `${origin}${path}`;
  }
  return path;
}
