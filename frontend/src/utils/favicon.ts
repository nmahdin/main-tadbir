import { faviconType, mediaUrl } from './mediaUrl';

/**
 * فاوآیکون سامانه در تب مرورگر.
 *
 * سه تجربهٔ گران‌قیمت پشت این فایل است:
 *
 * ۱) فایل بارگذاری‌شده لود می‌شد ولی مرورگر همان آیکون قبلی را نشان می‌داد؛
 *    چون در `index.html` یک `<link rel="icon" href="/favicon.svg">` ثابت بود و
 *    افکت قبلی فقط لینک‌های دارای `data-tadbir-favicon` را پاک می‌کرد. آن لینک
 *    هیچ‌وقت حذف نمی‌شد و مرورگر همچنان اول از همه همان را می‌خواند.
 *    قاعدهٔ تازه: در هر لحظه فقط **یک** لینک آیکون در سند می‌ماند و همهٔ
 *    `link[rel~="icon"]`ها (هر کسی ساخته باشد) مدیریت می‌شوند.
 *
 * ۲) ساختن و حذفِ لینک در زمان اجرا در همهٔ مرورگرها جدی گرفته نمی‌شود؛ بعضی
 *    مرورگرها آیکون را فقط از لینکِ **موجود در سند اولیه** می‌خوانند. پس از این
 *    پس همان لینکِ `index.html` نگه داشته و فقط `href`ش عوض می‌شود؛ لینک هیچ‌وقت
 *    حذف نمی‌شود تا تب حتی یک لحظه بی‌آیکون نماند.
 *
 * ۳) مرورگر فاوآیکون را بر اساس `href` کش می‌کند؛ پس نشانی تازه پارامتر نسخه
 *    دارد تا کش قبلی نمایش داده نشود. اگر فایل در دسترس نبود (شبکهٔ لحظه‌ای
 *    ضعیف)، یک بار دیگر تلاش می‌شود و تنها پس از آن آیکون پیش‌فرض بازمی‌گردد.
 */

export const PENDING_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

const DEFAULT_TYPE = 'image/svg+xml';

/** همهٔ لینک‌های آیکون سند (شامل `shortcut icon` و لینک ثابت `index.html`). */
const iconLinks = (): HTMLLinkElement[] =>
  Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));

/** نسخهٔ کوتاه و پایدار از مقدار تنظیمات؛ مرورگر با تغییر آن کش را دور می‌زند. */
const versionOf = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash).toString(36)}${value.length.toString(36)}`;
};

/**
 * تنها لینک آیکونِ سند.
 *
 * لینک ثابتِ `index.html` ترجیح دارد (چون از ابتدا در سند بوده)، بعد لینک
 * سفارشی و در نهایت هر لینک آیکون دیگری. بقیه حذف می‌شوند تا مرورگر بین چند
 * نامزد سردرگم نشود.
 */
const iconSlot = (): HTMLLinkElement => {
  const existing = iconLinks();
  const managed = existing.find(node => node.dataset.tadbirFavicon === 'pending')
    || existing.find(node => node.dataset.tadbirFavicon === 'custom')
    || existing[0];
  existing.filter(node => node !== managed).forEach(node => node.remove());
  if (managed) return managed;

  const created = document.createElement('link');
  created.rel = 'icon';
  created.dataset.tadbirFavicon = 'pending';
  created.type = DEFAULT_TYPE;
  created.href = PENDING_FAVICON;
  document.head.appendChild(created);
  return created;
};

/** Neutral placeholder for identity transitions; no old branded image is painted. */
const holdNeutral = (link: HTMLLinkElement): void => {
  if (link.dataset.tadbirFavicon === 'pending' && link.href === PENDING_FAVICON) return;
  link.dataset.tadbirFavicon = 'pending';
  link.type = DEFAULT_TYPE;
  link.href = PENDING_FAVICON;
};


/**
 * آیکون لمسی iOS/اندروید (`apple-touch-icon`) هم با همان فایل هم‌گام می‌شود؛
 * در غیر این صورت آیکون افزودن به صفحهٔ اصلی موبایل همان پیش‌فرض می‌ماند.
 * این لینک از `link[rel~="icon"]` جدا است، چون `apple-touch-icon` یک نشانهٔ
 * مستقل است و نباید جای آیکون تب را بگیرد.
 */
/** Kept only for invalidating the obsolete favicon browser cache. */
const FAVICON_STORAGE_KEY = 'tadbir:brand-favicon';

/**
 * فقط نشانی‌ای کش می‌شود که واقعاً لود شده است.
 *
 * پیش از این، مقدار خامِ تنظیمات (حتی وقتی فایل در دسترس نبود) در حافظه نوشته
 * می‌شد؛ صفحه در بار بعد همان نشانی شکسته را پیش از رندر روی تب می‌گذاشت و
 * مرورگر آیکون قبلی را نگه می‌داشت.
 */
const rememberFavicon = (href: string | null): void => {
  try {
    if (href) window.localStorage.setItem(FAVICON_STORAGE_KEY, href);
    else window.localStorage.removeItem(FAVICON_STORAGE_KEY);
  } catch { /* حافظهٔ مرورگر ممکن است بسته باشد */ }
};

const APPLE_ICON = 'link[rel="apple-touch-icon"]';

const clearAppleIcon = (): void => {
  document.head.querySelectorAll<HTMLLinkElement>(APPLE_ICON).forEach(node => node.remove());
};

const mirrorAppleIcon = (href: string): void => {
  clearAppleIcon();
  const link = document.createElement('link');
  link.rel = 'apple-touch-icon';
  link.dataset.tadbirFavicon = 'apple';
  link.href = href;
  document.head.appendChild(link);
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
  const link = iconSlot();

  // No organization favicon: stay neutral; the old built-in icon is removed.
  if (!url) {
    holdNeutral(link);
    clearAppleIcon();
    rememberFavicon(null);
    return () => {};
  }

  const mime = faviconType(url);
  const href = `${url}${url.includes('?') ? '&' : '?'}v=${versionOf(value)}`;

  let cancelled = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const load = (): void => {
    const probe = new Image();
    let settled = false;

    probe.onload = () => {
      if (settled || cancelled) return;
      settled = true;
      // همان لینک سند به فایل تازه اشاره می‌کند؛ آخر بردنش در `head` هم باعث
      // می‌شود مرورگر این آیکون را آخرین و معتبرترین نامزد ببیند.
      // Avoid resetting the tab icon when multiple identity requests resolve
      // with the same URL (login and authenticated workspace).
      if (link.href !== href || link.dataset.tadbirFavicon !== 'custom') {
        link.dataset.tadbirFavicon = 'custom';
        if (mime) link.type = mime;
        else link.removeAttribute('type');
        link.href = href;
      }
      mirrorAppleIcon(href);
      // No cached favicon is rendered at startup; invalidate legacy cache.
      rememberFavicon(null);
    };

    probe.onerror = () => {
      if (settled || cancelled) return;
      settled = true;
      attempt += 1;
      // یک تلاش دوباره: خطای گذرا نباید آیکون سفارشی را برای همیشه کنار بگذارد.
      if (attempt === 1) {
        retry = setTimeout(load, 900);
        return;
      }
      // A transient network error is not evidence that the organization
      // deliberately removed its icon. Never flash the old default asset.
      if (link.dataset.tadbirFavicon !== 'custom') holdNeutral(link);
      clearAppleIcon();
      rememberFavicon(null);
    };

    probe.src = href;
  };

  load();

  return () => {
    cancelled = true;
    if (retry) clearTimeout(retry);
  };
}
