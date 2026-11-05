import { runtime } from '../config/runtime';

/**
 * نشانی رسانه‌های ذخیره‌شده در سرور (عکس پروفایل، لوگو، فاویکون).
 *
 * سرور مسیرهایی مثل `/storage/avatars/…` را برمی‌گرداند؛ این مسیر نسبت به
 * **میزبان API** معنا دارد، نه میزبان پنل. در استقرار واقعی این دو دامنه
 * جدا هستند (`api-…` و پنل)، و در حالت توسعه هم Vite مسیر `/storage` را
 * به بک‌اند پروکسی می‌کند. بدون این تبدیل، مرورگر تصویر را از دامنهٔ پنل
 * می‌خواست و همهٔ عکس‌های پروفایل شکسته نمایش داده می‌شدند.
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

const SERVER_PATHS = ['/storage/', '/brand/', '/avatars/', '/uploads/', '/media/'];

/** مسیر نسبیِ سرور را به نشانی کامل تبدیل می‌کند؛ نشانی‌های کامل و blob دست‌نخورده می‌مانند. */
export function mediaUrl(raw?: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (/^(https?:|blob:|data:|file:)/i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (SERVER_PATHS.some(prefix => normalized.startsWith(prefix))) {
    return `${apiOrigin()}${normalized}`;
  }
  return normalized;
}
