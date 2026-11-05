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

/**
 * نشانی‌هایی که در همین نشست کامل نمایش داده شده‌اند.
 *
 * چرا لازم است: مدال پیش‌نمایش با هر بار باز‌شدن از نو ساخته می‌شود و وضعیت
 * «آماده»‌اش هم از نو صفر می‌شد؛ نتیجه این بود که تصویری که همین چند لحظه پیش
 * دیده شده بود، دوباره «در حال لود تصویر…» نشان می‌داد و بعد پنهان می‌شد. با
 * این حافظه، تصویرِ کش‌شده بی‌درنگ «آماده» شناخته می‌شود و هیچ پرشی رخ نمی‌دهد.
 */
const loaded = new Set<string>();

export function markImageLoaded(src?: string | null): void {
  const url = (src || '').trim();
  if (!url) return;
  loaded.add(url);
  if (loaded.size > MAX_ENTRIES * 2) {
    const oldest = loaded.values().next().value;
    if (oldest !== undefined) loaded.delete(oldest);
  }
}

/** آیا این تصویر در همین نشست کامل لود شده است؟ */
export function isImageLoaded(src?: string | null): boolean {
  const url = (src || '').trim();
  if (!url) return false;
  if (loaded.has(url)) return true;
  const preloaded = cache.get(url);
  if (preloaded?.complete && preloaded.naturalWidth > 0) {
    loaded.add(url);
    return true;
  }
  return false;
}

export function preloadImage(src?: string | null): void {
  const url = (src || '').trim();
  if (!url || cache.has(url) || typeof window === 'undefined') return;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => { if (image.naturalWidth > 0) markImageLoaded(url); };
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
  return isImageLoaded(src);
}
