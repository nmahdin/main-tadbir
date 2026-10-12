/**
 * نمایش حجم فایل با واحدهای فارسی — یک منبع واحد برای همهٔ صفحه‌ها.
 *
 * جای نسخه‌های تکراری محلی در DAM و بخش پیوست‌های وظیفه را گرفته است تا یک عدد
 * در همهٔ صفحه‌ها یک‌شکل خوانده شود.
 */
export function formatBytesFa(bytes = 0, empty = '۰ بایت', maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return empty;

  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toLocaleString('fa-IR', { maximumFractionDigits })} ${units[index]}`;
}
