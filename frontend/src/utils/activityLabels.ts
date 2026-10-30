/**
 * برچسب‌های فارسی رویدادها — یک منبع واحد برای همهٔ فیدهای فعالیت.
 *
 * دلیل وجود این فایل: رویدادها در پایگاه‌داده با کد ماشینی ثبت می‌شوند
 * (`duplicate_reused`، `bale_settings_changed`) و هر نمایش‌دهنده جدول برچسب
 * جداگانهٔ خودش را داشت؛ نتیجه این بود که بعضی صفحه‌ها کد خام انگلیسی نشان
 * می‌دادند. اینجا هم ترجمه‌ها یکی شده‌اند و هم `activityLabel` تضمین می‌کند
 * هیچ متن لاتین خامی به کاربر نشان داده نشود.
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  // دارایی‌های دیجیتال
  created: 'ایجاد دارایی',
  updated: 'ویرایش مشخصات',
  moved: 'انتقال به پوشه',
  downloaded: 'دانلود فایل',
  previewed: 'پیش‌نمایش فایل',
  attached: 'اتصال به یک بخش',
  deleted: 'بایگانی',
  restored: 'بازیابی',
  version_created: 'ایجاد نسخه',
  version_restored: 'بازیابی نسخه',
  status_changed: 'تغییر وضعیت',
  confidentiality_changed: 'تغییر سطح محرمانگی',
  ownership_changed: 'تغییر مالک',
  duplicate_reused: 'نسخهٔ تکراری موجود بازاستفاده شد',
  bale_created: 'دارایی از ربات بله ساخته شد',
  temporary_link_created: 'ساخت پیوند موقت دو ساعته',

  // Google Workspace (دارایی و ردیف‌های جدول)
  google_docs_pushed: 'ارسال نسخه به Google Docs',
  google_docs_pulled: 'دریافت نسخه از Google Docs',
  google_sheets_row_created: 'ردیف از Google Sheets ایجاد شد',
  google_sheets_row_updated: 'ردیف از Google Sheets به‌روز شد',
  google_sheets_row_deleted: 'ردیف در Google Sheets حذف شد',
  google_sheets_pushed: 'نسخه به Google Sheets ارسال شد',
  google_sheets_pulled: 'نسخه از Google Sheets دریافت شد',
  google_workspace_disconnected: 'اتصال Google Workspace قطع شد',

  // ردیف‌های جدول دارایی
  task_linked: 'به تسک متصل شد',
  task_unlinked: 'اتصال تسک قطع شد',
  content_linked: 'به محتوا متصل شد',
  content_unlinked: 'اتصال محتوا قطع شد',

  // ربات بله
  bale_token_changed: 'توکن ربات بله تغییر کرد',
  bale_settings_changed: 'تنظیمات ربات بله ذخیره شد',
  bale_automations_changed: 'خودکارسازی‌های ربات بله تغییر کرد',
  bale_account_linked: 'حساب بله کاربر به سامانه متصل شد',
  bale_account_unlinked: 'اتصال حساب بله کاربر قطع شد',
  bale_preferences_changed: 'دسته‌بندی اعلان‌های بله تغییر کرد',
  bale_disconnected: 'اتصال ربات بله حذف شد',
  bale_disconnected_local_only: 'تنظیمات بله فقط در سامانه پاک شد؛ اتصال بیرونی دست‌نخورده ماند',
  bale_webhook_rotated: 'آدرس امن دریافت خودکار بله تعویض شد',
  bale_webhook_activation_requested: 'فعال‌سازی دریافت خودکار بله ثبت شد',
  bale_meeting_reminder: 'یادآوری جلسه از بله ارسال شد',
  bale_asset_access_changed: 'دسترسی دپارتمانی دارایی تغییر کرد',

  // سازمان، نقش‌ها و نگهداری
  role_created: 'نقش تازه ساخته شد',
  role_updated: 'نقش ویرایش شد',
  role_permissions_updated: 'مجوزهای نقش تغییر کرد',
  role_deleted: 'نقش حذف شد',
  dam_table_departments_changed: 'دپارتمان‌های جدول دارایی تغییر کرد',
  storage_relocated: 'محل ذخیرهٔ فایل‌ها منتقل شد',
  database_backup_created: 'پشتیبان پایگاه‌داده ساخته شد',
  database_restored: 'پایگاه‌داده بازگردانی شد',
};

const DETAIL_FIELD_LABELS: Record<string, string> = {
  name: 'نام',
  description: 'توضیحات',
  status: 'وضعیت',
  managerId: 'مدیر',
  parentId: 'ساختار والد',
  members: 'اعضا',
  title: 'عنوان',
  deadline: 'سررسید',
  priority: 'اولویت',
  assigneeId: 'مسئول',
  permissions: 'مجوزها',
  files_root: 'مسیر فایل‌ها',
};

const PERSIAN = /[\u0600-\u06FF]/;

const hasPersian = (text: string) => PERSIAN.test(text);

/**
 * متن خوانا برای یک رویداد: کد شناخته‌شده ترجمه می‌شود، متن فارسی دست‌نخورده
 * می‌ماند و کد ناشناس هرگز خام نمایش داده نمی‌شود.
 */
export function activityLabel(
  action?: string | null,
  fallback = 'رویداد سامانه',
  overrides?: Record<string, string>,
): string {
  const value = (action ?? '').trim();

  if (value === '') return fallback;

  const known = overrides?.[value] ?? ACTIVITY_LABELS[value];

  if (known) return known;

  return hasPersian(value) ? value : fallback;
}

/** شرح رویداد: فیلدهای تغییرکرده و اشاره‌های فنی به فارسی خوانا تبدیل می‌شوند. */
export function activityDetails(details?: string | null): string | null {
  const text = (details ?? '').trim();

  if (text === '') return null;

  const fields = text.match(/fields:([A-Za-z0-9_,.-]+)/)?.[1]
    ?.split(',')
    .map(field => DETAIL_FIELD_LABELS[field] || '')
    .filter(Boolean);

  if (fields?.length) return `موارد تغییرکرده: ${fields.join('، ')}`;

  // «content:145» یا «table:7; run:3» جزئیات فنی است و بخشی از آن قابل خواندن نیست.
  if (/^[A-Za-z][A-Za-z0-9_]*\s*:\s*\S+/.test(text) && ! hasPersian(text)) {
    return 'جزئیات فنی این رویداد در گزارش امن سامانه ثبت شده است.';
  }

  if (! hasPersian(text) && /^[a-z0-9_.:-]+$/i.test(text)) {
    return 'جزئیات فنی این رویداد در گزارش امن سامانه ثبت شده است.';
  }

  return text;
}
