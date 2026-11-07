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
  return {
    status,
    message: error instanceof ApiConnectionError ? error.message
      : repair && error instanceof ApiError ? error.message
        : status >= 500 ? 'عملیات انجام نشد. در صورت تکرار مشکل، با مدیر سیستم تماس بگیرید.'
          : fixed[status] || (error instanceof Error ? error.message : fixed[0]),
    fields: error instanceof ApiError && status === 422 ? error.errors ?? {} : {},
    requestId: error instanceof ApiError ? error.requestId : undefined,
  };
}
