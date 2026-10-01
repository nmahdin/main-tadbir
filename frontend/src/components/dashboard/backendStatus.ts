import type { HealthPayload } from '../../api/health';

/**
 * وضعیت قابل نمایش یک بررسی سلامت.
 *
 * - `ok`          : پاسخ سالم مطابق قرارداد
 * - `down`        : سرویس پاسخ داد اما ناسالم است (503 یا ok=false)
 * - `unreachable` : هیچ پاسخی نرسید؛ شبکه، آدرس API یا سرور در دسترس نیست
 * - `invalid`     : پاسخ مطابق قرارداد سلامت نبود (دامنه/مسیر اشتباه، پاسخ غیر JSON)
 * - `unknown`     : خطای دیگر؛ برای مثال تعویض نشست در میانهٔ درخواست
 */
export type BackendState = 'ok' | 'down' | 'unreachable' | 'invalid' | 'unknown';

export type BackendKind = 'api' | 'db';

export interface BackendTile {
  state: BackendState;
  label: string;
  detail: string;
}

/** منطقهٔ زمانی نمایش زمان سرور؛ مطابق تنظیم پیش‌فرض سازمان. */
export const BACKEND_STATUS_TIME_ZONE = 'Asia/Tehran';

/** فقط `status` خطا خوانده می‌شود؛ ماژول بدون وابستگی runtime قابل تست می‌ماند. */
function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

/**
 * نگاشت نتیجهٔ یک بررسی سلامت به وضعیت.
 *
 * متن خام سرور هرگز نمایش داده نمی‌شود؛ فقط status خطا تفسیر می‌شود تا خطای
 * زیرساخت (SQL، trace یا پیام هاست) به کاربر نشت نکند.
 */
export function backendState(payload: unknown, error: unknown): BackendState {
  if (error !== null && error !== undefined) {
    const status = errorStatus(error);
    if (status === 0) return 'unreachable';
    if (status === 502) return 'invalid';
    if (status === 503) return 'down';
    if (status === 408) return 'unreachable';
    return 'unknown';
  }

  const ok = (payload as HealthPayload | null | undefined)?.ok;
  if (typeof ok === 'boolean') return ok ? 'ok' : 'down';
  return 'invalid';
}

/** برچسب کوتاه فارسی برای وضعیت؛ برای دیتابیس، «بررسی نشد» گویاتر از «در دسترس نیست» است. */
export function backendStateLabel(state: BackendState, kind: BackendKind): string {
  if (state === 'ok') return 'سالم';
  if (state === 'down') return kind === 'db' ? 'قطع' : 'پاسخ ناسالم';
  if (state === 'unreachable') return kind === 'db' ? 'بررسی نشد' : 'در دسترس نیست';
  if (state === 'invalid') return 'پاسخ نامعتبر';
  return 'نامشخص';
}

const API_DETAILS: Record<Exclude<BackendState, 'ok'>, string> = {
  down: 'سرور پاسخ ناسالم داد؛ وضعیت سرویس و لاگ سرور بررسی شود.',
  unreachable: 'ارتباط با سرور برقرار نشد؛ آدرس API یا شبکه بررسی شود.',
  invalid: 'پاسخ سرور مطابق قرارداد سلامت نبود؛ دامنه و مسیر API بررسی شود.',
  unknown: 'وضعیت سرویس قابل تأیید نبود؛ دوباره بررسی کنید.',
};

const DB_DETAILS: Record<Exclude<BackendState, 'ok'>, string> = {
  down: 'اتصال دیتابیس برقرار نشد؛ این مورد نیازمند بررسی مدیر سیستم است.',
  unreachable: 'تا برقراری ارتباط با سرور، وضعیت دیتابیس بررسی نمی‌شود.',
  invalid: 'پاسخ مسیر سلامت دیتابیس مطابق قرارداد نبود.',
  unknown: 'وضعیت اتصال دیتابیس قابل تأیید نبود.',
};

function apiDetail(payload: unknown, state: BackendState): string {
  if (state !== 'ok') return API_DETAILS[state];

  const data = payload as HealthPayload | null | undefined;
  const service = typeof data?.service === 'string' && data.service.trim() ? data.service.trim() : 'tadbir-api';
  const version = typeof data?.version === 'string' && data.version.trim() ? data.version.trim() : 'v1';

  return `سرویس ${service} • قرارداد ${version}`;
}

function dbDetail(state: BackendState): string {
  return state === 'ok' ? 'اتصال سرور به دیتابیس برقرار است.' : DB_DETAILS[state];
}

/**
 * وضعیت هر دو بررسی را یک‌جا می‌سازد.
 *
 * اگر ارتباط با سرور قطع باشد، وضعیت دیتابیس «بررسی نشد» می‌شود نه «قطع»؛
 * چون در آن حالت هیچ اطلاعاتی دربارهٔ دیتابیس وجود ندارد.
 */
export function describeBackendHealth(input: {
  api: { payload?: unknown; error?: unknown };
  db: { payload?: unknown; error?: unknown };
}): { api: BackendTile; db: BackendTile } {
  const apiState = backendState(input.api.payload, input.api.error);
  const dbState = apiState === 'unreachable' ? 'unreachable' : backendState(input.db.payload, input.db.error);

  return {
    api: { state: apiState, label: backendStateLabel(apiState, 'api'), detail: apiDetail(input.api.payload, apiState) },
    db: { state: dbState, label: backendStateLabel(dbState, 'db'), detail: dbDetail(dbState) },
  };
}

/** زمان گزارش‌شدهٔ سرور با ارقام فارسی و در منطقهٔ زمانی سازمان. */
export function formatServerTime(value: unknown, timeZone: string = BACKEND_STATUS_TIME_ZONE): string {
  if (typeof value !== 'string' || !value.trim()) return 'نامشخص';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'نامشخص';

  try {
    return new Intl.DateTimeFormat('fa-IR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return date.toLocaleString('fa-IR');
  }
}

/** فاصلهٔ آخرین بررسی تا «الان» به زبان کاربر. */
export function relativeCheckLabel(checkedAt: string | number | null | undefined, now: number = Date.now()): string {
  if (checkedAt === null || checkedAt === undefined || checkedAt === '') return 'هنوز بررسی نشده';

  const timestamp = typeof checkedAt === 'number' ? checkedAt : new Date(checkedAt).getTime();
  // react-query پیش از نخستین پاسخ، dataUpdatedAt را صفر نگه می‌دارد.
  if (timestamp <= 0 && Number.isFinite(timestamp)) return 'هنوز بررسی نشده';
  if (!Number.isFinite(timestamp)) return 'زمان نامعتبر';

  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'همین حالا';
  if (seconds < 60) return `${seconds.toLocaleString('fa-IR')} ثانیه پیش`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes.toLocaleString('fa-IR')} دقیقه پیش`;

  return `${Math.floor(minutes / 60).toLocaleString('fa-IR')} ساعت پیش`;
}
