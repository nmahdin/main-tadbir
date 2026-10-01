const ERROR_LABELS: Record<string, string> = {
  unauthorized: 'توکن ربات معتبر نیست.',
  forbidden: 'بله اجازهٔ انجام این عملیات را نداد.',
  rate_limited: 'بله موقتاً تعداد درخواست‌ها را محدود کرده است؛ تلاش مجدد خودکار انجام می‌شود.',
  transport_unknown: 'نتیجهٔ ارسال مشخص نیست؛ برای جلوگیری از پیام تکراری، ارسال خودکار تکرار نشد.',
  response_unknown: 'پاسخ بله قابل تأیید نبود؛ برای جلوگیری از پیام تکراری، ارسال خودکار تکرار نشد.',
  invalid_response: 'پاسخ بله معتبر نبود.',
  webhook_mismatch: 'آدرس دریافت ثبت‌شده در بله با این سامانه هماهنگ نیست.',
  webhook_processing_failed: 'پردازش پیام دریافتی ناموفق بود.',
  webhook_credential_unreadable: 'کلید امن دریافت پیام قابل خواندن نیست و باید بازسازی شود.',
  credential_unreadable: 'توکن ذخیره‌شده قابل خواندن نیست و باید اتصال دوباره تنظیم شود.',
  not_configured: 'ربات هنوز پیکربندی نشده است.',
  worker_interrupted: 'ارسال در میانهٔ پردازش متوقف شد و نیازمند بررسی است.',
  access_revoked: 'ارسال به‌دلیل لغو دسترسی کاربر متوقف شد.',
  expired: 'پیام پیش از ارسال منقضی شد.',
  processing_failed: 'پردازش خودکار ناموفق بود.',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار ارسال خودکار',
  sending: 'در حال ارسال',
  sent: 'ارسال‌شده',
  failed: 'ناموفق',
  unknown: 'نتیجه نامشخص؛ نیازمند بررسی',
  cancelled: 'لغوشده',
};

export function baleErrorLabel(code: string | null | undefined): string {
  if (!code) return 'خطای ثبت‌نشده';
  return ERROR_LABELS[code] ?? `خطای عملیاتی با کد امن ${code}`;
}

export function baleDeliveryLabel(status: string): string {
  return STATUS_LABELS[status] ?? 'وضعیت نامشخص';
}

export function baleDate(value: string | null | undefined): string {
  if (!value) return 'هنوز ثبت نشده';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'زمان نامعتبر' : parsed.toLocaleString('fa-IR');
}
