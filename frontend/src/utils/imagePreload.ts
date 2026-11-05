/**
 * پیش‌بارگذاری تصویر روی «قصد کاربر».
 *
 * مقصد: وقتی کاربر نشانگر را روی یک کارت/ردیف می‌آورد یا روی آن فوکوس می‌کند،
 * درخواست تصویر همان‌جا شروع می‌شود؛ بنابراین باز‌کردن مدال پیش‌نمایش (یا کلیک
 * روی همان کارت) تصویر را «همین حالا حاضر» می‌بیند. این پیش‌بارگذاری از کش
 * HTTP مرورگر استفاده می‌کند و درخواست دوم چیزی به شبکه اضافه نمی‌کند.
 */
const MAX_ENTRIES = 48;
const cache = new Map<string, HTMLImageElement>();

export function preloadImage(src?: string | null): void {
  const url = (src || '').trim();
  if (!url || cache.has(url) || typeof window === 'undefined') return;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  cache.set(url, image);
  // حافظه کوچک نگه داشته می‌شود تا رفرنس‌های تصویر در فهرست‌های بلند جمع نشوند.
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** آیا این نشانی از قبل (در همین نشست) کامل لود شده است؟ */
export function isImagePreloaded(src?: string | null): boolean {
  const url = (src || '').trim();
  if (!url) return false;
  return Boolean(cache.get(url)?.complete);
}
