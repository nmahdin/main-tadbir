import { runtime } from '../config/runtime';

/**
 * وضعیت اتصال به اینترنت/سرور — یک منبع کوچک و مشترک.
 *
 * چرا لازم است: خطای شبکه پیش‌تر فقط یک متن قرمز داخل همان صفحه بود و کاربر
 * نمی‌دانست مشکل از اینترنت خودش است یا از سامانه. اینجا مرورگر (رویدادهای
 * `online`/`offline`) و لایهٔ API (شکست واقعی درخواست) هر دو وضعیت را در یک
 * جای مشترک می‌نویسند تا یک نوار سراسری، زیبا و قابل‌اقدام نمایش داده شود.
 *
 * نکتهٔ دور ۸۰: قطع اتصال حالا **خودش بررسی می‌شود**. نوار پیام بدون این که
 * چیزی را امتحان کند «قطعی» اعلام می‌کرد و تا کاربر دستی تلاش نمی‌کرد همان‌جا
 * می‌ماند؛ در نتیجه یک قطع کوتاه شبکه، پیام دائمی می‌ساخت. `probeConnection`
 * یک درخواست سبک و عمومی (`/health`) می‌فرستد که به نشست، مجوز یا پایگاه داده
 * کاری ندارد؛ اگر جواب بدهد یعنی اتصال برگشته است.
 */
type Listener = (offline: boolean) => void;

const listeners = new Set<Listener>();
let offline = typeof navigator !== 'undefined' && navigator.onLine === false;

/** مهلت هر بررسی؛ اگر سرور در این زمان پاسخ نداد، «قطع» حساب می‌شود. */
export const PROBE_TIMEOUT_MS = 6000;

export const isOffline = (): boolean => offline;

export const subscribeConnection = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const publish = (next: boolean): void => {
  if (next === offline) return;
  offline = next;
  listeners.forEach(listener => listener(offline));
};

/** شکست واقعی شبکه در درخواست به سرور (نه خطای ۴xx/۵xx سرور). */
export const markConnectionLost = (): void => publish(true);

/** پاسخ موفق از سرور؛ یعنی اتصال برگشته است. */
export const markConnectionRestored = (): void => publish(false);

/**
 * یک بررسی واقعی اتصال.
 *
 * چرا `/health`: عمومی است (بدون نشست و بدون توکن) و ارزان؛ پس نتیجه‌اش فقط
 * دربارهٔ «رسیدن به سرور» حرف می‌زند، نه دربارهٔ مجوز یا داده‌های کاربر. اگر
 * مرورگر خودش بگوید آفلاین است، بدون درخواست `false` برمی‌گردد تا هر بار
 * تلاشِ بی‌فایده روی شبکه انجام نشود.
 *
 * @param timeoutMs مهلت پاسخ؛ پیش‌فرض ۶ ثانیه
 */
export async function probeConnection(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof fetch !== 'function') return false;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${runtime.apiUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      // بدون کوکی: بررسی اتصال نباید نشست بسازد یا به مجوزها گره بخورد.
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (response.ok) {
      markConnectionRestored();
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

/** نصب شنونده‌های مرورگر؛ تابع پاک‌سازی برمی‌گرداند. */
export function installConnectionWatchers(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onlineHandler = () => publish(false);
  const offlineHandler = () => publish(true);
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  publish(navigator.onLine === false);

  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}
