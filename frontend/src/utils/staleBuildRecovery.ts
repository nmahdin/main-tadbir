/**
 * بازیابی از «نسخهٔ کهنهٔ مرورگر».
 *
 * پس از هر به‌روزرسانی سامانه، نام فایل بخش‌های صفحه‌ها (chunk) عوض می‌شود. اگر
 * مرورگر صفحهٔ قدیمی را باز نگه داشته باشد و کاربر وارد بخشی شود که هنوز دریافت
 * نشده است، خطای «Failed to fetch dynamically imported module» رخ می‌دهد و از
 * دید کاربر «صفحه باز نمی‌شود». اینجا در نخستین خطای بارگذاری، صفحه یک بار
 * تازه‌سازی می‌شود تا index.html و نام فایل‌های جدید دریافت شوند.
 *
 * برای پیشگیری از حلقهٔ بی‌پایان، تازه‌سازی خودکار در یک بازهٔ زمانی فقط یک بار
 * انجام می‌شود؛ اگر بعد از آن هم خطا تکرار شود، همان پیام راهنما با دکمهٔ
 * «بارگذاری نسخهٔ جدید» در مرز خطای React نمایش داده می‌شود.
 */
const STORAGE_KEY = 'tadbir:chunk-recovery-at';

/** فاصلهٔ امن بین دو تازه‌سازی خودکار؛ کوتاه‌تر از این، حلقه محسوب می‌شود. */
export const STALE_BUILD_COOLDOWN_MS = 15_000;

export function shouldRecoverStaleBuild(now: number = Date.now()): boolean {
  try {
    const previous = Number(window.sessionStorage.getItem(STORAGE_KEY) || 0);

    if (Number.isFinite(previous) && previous > 0 && now - previous < STALE_BUILD_COOLDOWN_MS) return false;

    window.sessionStorage.setItem(STORAGE_KEY, String(now));

    return true;
  } catch {
    // اگر حافظهٔ نشست در دسترس نباشد (حالت خصوصی یا تنظیمات مرورگر)، یک
    // تازه‌سازی تنها راه بازگرداندن کاربر است و خطری ایجاد نمی‌کند.
    return true;
  }
}

export function installStaleBuildRecovery(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  // Vite این رخداد را پیش از شکست import پویا اعلام می‌کند.
  window.addEventListener('vite:preloadError', (event: Event) => {
    if (!shouldRecoverStaleBuild()) return;

    event.preventDefault();
    window.location.reload();
  });
}
