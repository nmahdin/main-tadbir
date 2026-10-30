/**
 * پهنای ستون‌های «جدول اطلاعات» در دارایی‌های دیجیتال.
 *
 * پیش از این، پهنای هر ستون را مرورگر از روی طول محتوا تعیین می‌کرد؛ نتیجه این بود
 * که یک سلول بلند، همان ستون را پهن می‌کرد و بقیهٔ ستون‌ها فشرده می‌شدند. حالا
 * پهنای هر ستون یک مقدار صریح و ذخیره‌شده است: کاربر آن را در پنجرهٔ ستون تعیین
 * می‌کند و جدول با چیدمان ثابت (`table-fixed`) همان پهنای تعیین‌شده را رعایت
 * می‌کند و محتوای بلند در همان خانه می‌ماند.
 *
 * مقدار در همان ستون JSON جدول (`columns.*.width`) ذخیره می‌شود؛ پس هیچ ستون یا
 * جدول تازه‌ای در پایگاه داده لازم نیست و جدول‌های ساخته‌شدهٔ قبلی همان پهنای
 * پیش‌فرض را می‌گیرند.
 */

export const DEFAULT_TABLE_COLUMN_WIDTH = 160;
export const MIN_TABLE_COLUMN_WIDTH = 60;
export const MAX_TABLE_COLUMN_WIDTH = 1200;

/**
 * پهنای عملی ستون.
 *
 * قاعدهٔ یکسان برای نمایش و ذخیره: نبودِ عدد (خالی، متن، `NaN`) یعنی «پیش‌فرض» و
 * هر عدد دیگری داخل بازهٔ مجاز [۶۰، ۱۲۰۰] بریده می‌شود؛ پس مقدار خارج از بازه
 * هیچ‌وقت به جدول نمی‌رسد و رفتار مرورگر به حدس و گمان نمی‌افتد.
 */
export const tableColumnWidth = (width?: number | null): number => {
  if (width === null || width === undefined || String(width).trim() === '') return DEFAULT_TABLE_COLUMN_WIDTH;
  const value = Number(width);
  if (!Number.isFinite(value)) return DEFAULT_TABLE_COLUMN_WIDTH;

  return Math.min(MAX_TABLE_COLUMN_WIDTH, Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(value)));
};

/** برچسب فارسی پهنای ستون برای نمایش کنار سرستون و در پنجرهٔ ویرایش. */
export const tableColumnWidthLabel = (width?: number | null): string =>
  `${tableColumnWidth(width).toLocaleString('fa-IR')} پیکسل`;

/** پهنای کل شیت: شمارهٔ ردیف + ستون‌ها + ستون عملیات (تا اسکرول افقی درست بماند). */
export const dataTablePixelWidth = (widths: Array<number | null | undefined>): number =>
  40 + widths.reduce((sum, width) => sum + tableColumnWidth(width), 0) + 52;
