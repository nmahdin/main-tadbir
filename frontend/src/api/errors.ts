export type ApiValidationErrors = Record<string, string[]>;
export class ApiError extends Error {
  readonly status: number;
  readonly errors?: ApiValidationErrors;
  readonly payload?: unknown;
  readonly requestId?: string;
  constructor(message: string, status: number, errors?: ApiValidationErrors, payload?: unknown, requestId?: string) {
    super(message); this.name = 'ApiError'; this.status = status; this.errors = errors; this.payload = payload; this.requestId = requestId;
  }
}
/** A safe client-authored connection/configuration error, never server-provided text. */
export class ApiConnectionError extends ApiError {
  constructor(message: string, status = 0) {
    super(message, status);
    this.name = 'ApiConnectionError';
  }
}
/** Local cancellation, not an HTTP conflict returned by the server. */
export class SessionChangedError extends ApiError {
  constructor() {
    super('نشست درخواست تغییر کرده است؛ دوباره تلاش کنید.', 409);
    this.name = 'SessionChangedError';
  }
}
/** متن فارسی سرور؛ پیام‌های انگلیسی چارچوب (مثل Unauthenticated) نمایش داده نمی‌شوند. */
const PERSIAN_TEXT = /[\u0600-\u06FF]/;

/**
 * پیامِ فارسیِ نخستین خطای اعتبارسنجی.
 *
 * خطای ۴۲۲ همیشه یک پیام سطح‌بالا ندارد؛ دلیلِ واقعی در `errors.<field>` است.
 * بدون خواندن آن، کاربر فقط «اطلاعات واردشده معتبر نیست» می‌دید و نمی‌دانست کدام
 * ورودی رد شده است (مثلاً مهلتِ قبل از تاریخ شروع یا وضعیتِ ناشناختهٔ وظیفه).
 */
const firstFieldMessage = (fields?: ApiValidationErrors): string | null => {
  if (!fields) return null;
  for (const value of Object.values(fields)) {
    const message = (Array.isArray(value) ? value : [value]).find(item => typeof item === 'string' && PERSIAN_TEXT.test(item));
    if (message) return message;
  }
  return null;
};

export function parseApiError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 0;
  const fixed: Record<number, string> = {
    0: 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.',
    401: 'برای ادامه وارد حساب خود شوید.',
    403: 'شما مجوز انجام این عملیات را ندارید.',
    404: 'رکورد یا صفحهٔ مورد نظر پیدا نشد.',
    419: 'نشست امنیتی منقضی شده است. دوباره وارد شوید.',
    422: 'اطلاعات واردشده معتبر نیست.',
    429: 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.',
  };
  const repair = error instanceof ApiError && status === 503 && error.payload && typeof error.payload === 'object'
    && 'code' in error.payload && error.payload.code === 'installation_incomplete';
  // پیامِ دقیقِ سرور برای خطاهای اعتبارسنجی: اول خطای همان فیلد، سپس پیام فارسی
  // خودِ پاسخ، و در نهایت متنِ عمومیِ وضعیت.
  const validationDetail = error instanceof ApiError && status === 422
    ? firstFieldMessage(error.errors) ?? (PERSIAN_TEXT.test(error.message) ? error.message : null)
    : null;
  return {
    status,
    message: error instanceof ApiConnectionError ? error.message
      : repair && error instanceof ApiError ? error.message
        : validationDetail ?? (status >= 500 ? 'عملیات انجام نشد. در صورت تکرار مشکل، با مدیر سیستم تماس بگیرید.'
          : fixed[status] || (error instanceof Error ? error.message : fixed[0])),
    fields: error instanceof ApiError && status === 422 ? error.errors ?? {} : {},
    requestId: error instanceof ApiError ? error.requestId : undefined,
  };
}

/**
 * دقیق‌ترین پیام قابل‌نمایش برای یک خطای API.
 *
 * برای خطاهای ۴xx خودِ سرور دلیل را به فارسی می‌فرستد (`message` و
 * `errors.<field>`)؛ اما `parseApiError` برای یکنواختی پیام وضعیت را جای آن
 * می‌گذارد. نتیجه این بود که خطای ۴۲۲ ذخیرهٔ جریان محتوا فقط «اطلاعات واردشده
 * معتبر نیست» دیده می‌شد، در حالی که سرور دقیقاً گفته بود کدام قانون نقض شده
 * است. این تابع اول پیام میدانی سرور را برمی‌گرداند، سپس پیام خودِ خطا و در
 * نهایت همان پیام عمومی را.
 */
/**
 * فهرست خوانای خطاهای اعتبارسنجی برای نمایش زیر فرم (بدون تکرار).
 *
 * برای ۴۲۲، همهٔ پیام‌های فیلدها کنار هم می‌آیند تا اگر چند ورودی رد شده‌اند،
 * کاربر یک‌جا ببیند؛ برای بقیهٔ خطاها همان پیام کوتاه برمی‌گردد.
 */
export function apiErrorDetails(error: unknown, fallback?: string): string[] {
  const parsed = parseApiError(error);
  const messages = Object.values((parsed.fields || {}) as ApiValidationErrors)
    .flat()
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const unique = [...new Set(messages)];
  return unique.length ? unique.slice(0, 6) : [apiErrorMessage(error, fallback)];
}

export function apiErrorMessage(error: unknown, fallback?: string): string {
  const parsed = parseApiError(error);
  const fields = (parsed.fields || {}) as ApiValidationErrors;
  const fieldMessage = Object.values(fields).flat()
    .find(value => typeof value === 'string' && PERSIAN_TEXT.test(value));
  if (fieldMessage) return fieldMessage;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && PERSIAN_TEXT.test(error.message)) {
    return error.message;
  }

  return parsed.message || fallback || 'اطلاعات واردشده معتبر نیست.';
}
