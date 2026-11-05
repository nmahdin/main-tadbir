import { faviconType, mediaUrl } from './mediaUrl';

/**
 * فاوآیکون سامانه در تب مرورگر.
 *
 * دو تجربهٔ گران‌قیمت پشت این فایل است:
 *
 * ۱) فایل بارگذاری‌شده لود می‌شد ولی مرورگر همان آیکون قبلی را نشان می‌داد؛
 *    چون در `index.html` یک `<link rel="icon" href="/favicon.svg">` ثابت بود و
 *    افکت قبلی فقط لینک‌های دارای `data-tadbir-favicon` را پاک می‌کرد. آن لینک
 *    هیچ‌وقت حذف نمی‌شد و مرورگر همچنان اول از همه همان را می‌خواند.
 *    قاعدهٔ تازه: در هر لحظه فقط **یک** لینک آیکون در سند می‌ماند و همهٔ
 *    `link[rel~="icon"]`ها (هر کسی ساخته باشد) مدیریت می‌شوند.
 *
 * ۲) مرورگر فاوآیکون را بر اساس `href` کش می‌کند؛ پس نشانی تازه باید پارامتر
 *    نسخه داشته باشد تا کش قبلی نمایش داده نشود. تا پیش از تأیید لود هم آیکون
 *    پیش‌فرض روی صفحه می‌ماند تا تب هرگز بی‌آیکون نباشد و اگر فایل در دسترس
 *    نبود، همان پیش‌فرض بازگردانده می‌شود.
 */

/** آیکون پیش‌فرض پروژه؛ در `index.html` هم همین نشانه‌گذاری شده است. */
export const DEFAULT_FAVICON = '/favicon.svg';

const DEFAULT_TYPE = 'image/svg+xml';

/** همهٔ لینک‌های آیکون سند (شامل `shortcut icon` و لینک ثابت `index.html`). */
const iconLinks = (): HTMLLinkElement[] =>
  Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));

const isCustom = (node: HTMLLinkElement): boolean => node.dataset.tadbirFavicon === 'custom';

/** نسخهٔ کوتاه و پایدار از مقدار تنظیمات؛ مرورگر با تغییر آن کش را دور می‌زند. */
const versionOf = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash).toString(36)}${value.length.toString(36)}`;
};

/** اگر آیکونی جز آیکون سفارشی نمانده باشد، پیش‌فرض را برمی‌گرداند. */
const ensureDefault = (): HTMLLinkElement => {
  const kept = iconLinks().filter(node => !isCustom(node));
  if (kept.length > 0) return kept[0];

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = DEFAULT_TYPE;
  link.href = DEFAULT_FAVICON;
  link.dataset.tadbirFavicon = 'default';
  document.head.appendChild(link);
  return link;
};

/**
 * آیکون تب را با تنظیمات جاری هم‌گام می‌کند.
 *
 * مقدار بازگشتی، تابع پاک‌سازی افکت است؛ اگر در میانهٔ لود تنظیمات عوض شود،
 * نتیجهٔ دیررس نادیده گرفته می‌شود و آیکون به هم نمی‌ریزد.
 */
export function applyFavicon(raw?: string | null): () => void {
  const value = String(raw || '').trim();
  const url = value ? mediaUrl(value) : '';

  // بدون فایل سفارشی: آیکون‌های سفارشی برداشته می‌شوند و پیش‌فرض می‌ماند.
  if (!url) {
    iconLinks().filter(isCustom).forEach(node => node.remove());
    ensureDefault();
    return () => {};
  }

  const mime = faviconType(url);
  const href = `${url}${url.includes('?') ? '&' : '?'}v=${versionOf(value)}`;

  const link = document.createElement('link');
  link.rel = 'icon';
  link.dataset.tadbirFavicon = 'custom';
  if (mime) link.type = mime;
  link.href = href;

  let cancelled = false;
  const probe = new Image();
  probe.onload = () => {
    if (cancelled) {
      link.remove();
      return;
    }
    // فقط همین لینک می‌ماند؛ حذف قبلی‌ها و بازافزودن، مرورگر را به بازخوانی
    // آیکون وامی‌دارد و ترتیب سند هم به نفع آیکون تازه می‌شود.
    iconLinks().forEach(node => node.remove());
    document.head.appendChild(link);
  };
  probe.onerror = () => {
    // فایل در دسترس نیست: آیکون سفارشی برداشته و پیش‌فرض برمی‌گردد.
    if (cancelled) return;
    link.remove();
    ensureDefault();
  };
  probe.src = href;

  // لینک تازه پیش از تأیید لود هم اضافه می‌شود تا اگر مرورگر زودتر تصمیم
  // بگیرد، آیکون درست را ببیند؛ در خطا دوباره حذف می‌شود.
  document.head.appendChild(link);

  return () => {
    cancelled = true;
    probe.onload = null;
    probe.onerror = null;
  };
}
