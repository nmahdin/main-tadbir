import { request } from './client';

/** قرارداد پاسخ مسیرهای سلامت بک‌اند (HealthController). */
export interface HealthPayload {
  ok?: boolean;
  service?: string;
  version?: string;
  time?: string;
  message?: string;
  error?: string;
}

/**
 * بررسی سلامت بک‌اند برای کارت وضعیت سامانه.
 *
 * هر دو مسیر عمومی و بدون نشست‌اند؛ پس پاسخ 503 یعنی سرویس/دیتابیس در دسترس
 * نیست، نه خطای احراز هویت. قفل cache غیرفعال است تا نتیجه، وضعیت لحظهٔ
 * درخواست باشد و پایش، مقدار کهنه نشان ندهد.
 */
export const healthApi = {
  api() {
    return request<HealthPayload>('/health', { cache: 'no-store' });
  },
  db() {
    return request<HealthPayload>('/health/db', { cache: 'no-store' });
  },
};
