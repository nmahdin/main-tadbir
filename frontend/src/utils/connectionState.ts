/**
 * وضعیت اتصال به اینترنت/سرور — یک منبع کوچک و مشترک.
 *
 * چرا لازم است: خطای شبکه پیش‌تر فقط یک متن قرمز داخل همان صفحه بود و کاربر
 * نمی‌دانست مشکل از اینترنت خودش است یا از سامانه. اینجا مرورگر (رویدادهای
 * `online`/`offline`) و لایهٔ API (شکست واقعی درخواست) هر دو وضعیت را در یک
 * جای مشترک می‌نویسند تا یک نوار سراسری، زیبا و قابل‌اقدام نمایش داده شود.
 */
type Listener = (offline: boolean) => void;

const listeners = new Set<Listener>();
let offline = typeof navigator !== 'undefined' && navigator.onLine === false;

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
