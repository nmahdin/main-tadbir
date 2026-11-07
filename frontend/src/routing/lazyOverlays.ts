/**
 * بارگیریِ از پیشِ مدال‌های سراسری (نه صفحه‌های مسیر).
 *
 * مدال‌ها با `React.lazy` بیرون از بستهٔ اولیه نگه داشته می‌شوند تا صفحهٔ
 * ورود سبک بماند؛ اما «جست‌وجوی سراسری» با اولین ضربه روی موبایل باید بی‌درنگ
 * باز شود. این تابع همان بستهٔ کوچک را در زمان بیکاری (یا با قصد کاربر، مثل
 * هاور/لمسِ آیکون جست‌وجو) از پیش می‌گیرد؛ بنابراین بارگیریِ دوباره ندارد و
 * فوکوس/کیبورد هم در همان نخستین ضربه انجام می‌شود.
 */
let searchPromise: Promise<unknown> | null = null;

export function preloadGlobalSearch(): Promise<unknown> {
  if (searchPromise) return searchPromise;
  searchPromise = import('../components/layout/GlobalSearchModal').catch(() => {
    // شکست پیش‌بارگیری بی‌صداست؛ ضربهٔ بعدی دوباره تلاش می‌کند.
    searchPromise = null;
    return null;
  });
  return searchPromise;
}
