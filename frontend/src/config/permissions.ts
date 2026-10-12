import type { PermissionItem } from '../types';

export const SYSTEM_PERMISSIONS: PermissionItem[] = [
  // مدیریت دپارتمان‌ها (Departments)
  { id: "departments.view", label: "مشاهده دپارتمان‌ها", description: "مشاهده ساختار درختی و لیست دپارتمان‌ها", category: "departments" },
  { id: "departments.create", label: "ایجاد دپارتمان", description: "تعریف دپارتمان جدید در ساختار سازمانی", category: "departments" },
  { id: "departments.edit", label: "ویرایش دپارتمان", description: "ویرایش مشخصات و مدیر دپارتمان", category: "departments" },
  { id: "departments.delete", label: "حذف دپارتمان", description: "حذف دپارتمان", category: "departments" },
  { id: "departments.manage_members", label: "مدیریت اعضای دپارتمان", description: "افزودن، ویرایش و حذف اعضای دپارتمان", category: "departments" },

  // مدیریت محتوا (Content)
  { id: "content.view", label: "مشاهده محتواها", description: "مشاهده لیست تولیدات محتوایی", category: "content" },
  { id: "content.watch", label: "دنبال‌کردن محتوای در دسترس", description: "دریافت اعلان رویدادهای مهم محتوایی که کاربر از قبل به آن دسترسی دارد", category: "content" },
  { id: "content.create", label: "ایجاد محتوا", description: "ثبت ایده و برنامه تولید محتوای جدید", category: "content" },
  { id: "content.edit", label: "ویرایش محتوا و جریان", description: "ویرایش اطلاعات، وضعیت، مراحل جریان و مسئولان محتوا", category: "content" },
  { id: "content.workflow.manage", label: "مدیریت جریان تولید محتوا", description: "طراحی مراحل، ارزیابان و سیاست پیشروی جریان محتوا", category: "content" },
  { id: "content.delete", label: "حذف محتوا", description: "حذف محتوا", category: "content" },
  { id: "content.force_delete", label: "حذف دائمی محتوا", description: "حذف نهایی پرونده محتوا با تأیید صریح و ثبت در گزارش عملیات", category: "content" },
  { id: "content.review", label: "بازبینی محتوا", description: "ثبت نظر بازبینی و درخواست اصلاح", category: "content" },
  { id: "content.approve", label: "تأیید نهایی محتوا", description: "تأیید کیفی و انتشار محتوا", category: "content" },
  { id: "content.publish", label: "مدیریت انتشار", description: "زمان‌بندی و تغییر وضعیت انتشار", category: "content" },


  // مدیریت کاربران (Users)
  { id: 'users.view', label: 'مشاهده لیست کاربران', description: 'امکان مشاهده اسامی، اطلاعات هویتی و عناوین سازمانی', category: 'users' },
  { id: 'users.view_details', label: 'مشاهده جزئیات و پروفایل کاربر', description: 'دسترسی به لاگ‌ها، مهارت‌ها، سوابق ورود و اطلاعات تماس', category: 'users' },
  { id: 'users.create', label: 'ایجاد کاربر جدید', description: 'امکان تعریف کاربر جدید، تعیین رمز عبور موقت و ارسال مشخصات', category: 'users' },
  { id: 'users.edit', label: 'ویرایش مشخصات کاربر', description: 'ویرایش نام، نام کاربری، دپارتمان، مهارت‌ها و نقش سازمانی', category: 'users' },
  { id: 'users.status', label: 'تغییر وضعیت و مسدودسازی', description: 'امکان فعال‌سازی، غیرفعال‌سازی، تعلیق و مسدودسازی حساب', category: 'users' },
  { id: 'users.delete', label: 'حذف کاربر از سیستم', description: 'حذف دائمی رکورد کاربر از سامانه تدبیر', category: 'users' },

  // مدیریت نقش‌ها و ماتریس دسترسی (Roles & Permissions)
  { id: 'roles.view', label: 'مشاهده لیست نقش‌ها', description: 'مشاهده نقش‌های سیستمی و سفارشی و تعداد کاربران منتسب', category: 'roles' },
  { id: 'roles.create', label: 'تعریف نقش جدید', description: 'ایجاد نقش سازمانی جدید با عنوان و رنگ اختصاصی', category: 'roles' },
  { id: 'roles.edit', label: 'ویرایش مشخصات نقش', description: 'تغییر نام، رنگ و توضیحات نقش‌های سازمانی', category: 'roles' },
  { id: 'roles.manage_permissions', label: 'مدیریت مجوزها و ماتریس دسترسی', description: 'تخصیص یا سلب دسترسی‌های عملیاتی از نقش‌ها', category: 'roles' },
  { id: 'roles.delete', label: 'حذف نقش سازمانی', description: 'حذف نقش‌های سفارشی تعریف شده', category: 'roles' },

  // مدیریت پروژه‌ها (Projects)
  { id: 'projects.view', label: 'مشاهده پروژه‌ها', description: 'دسترسی به فهرست پروژه‌ها و جزئیات پیشرفت', category: 'projects' },
  { id: 'projects.create', label: 'ایجاد پروژه جدید', description: 'تعریف پروژه با الگوهای سفارشی، بودجه و تیم', category: 'projects' },
  { id: 'projects.edit', label: 'ویرایش مشخصات پروژه', description: 'تغییر تاریخ‌ها، وضعیت، بودجه، مدیر پروژه و اعضا', category: 'projects' },
  { id: 'projects.delete', label: 'حذف و بایگانی پروژه', description: 'آرشیو کردن یا حذف کامل پروژه و اطلاعات آن', category: 'projects' },

  // مدیریت وظایف (Tasks)
  { id: 'tasks.view', label: 'مشاهده وظایف', description: 'دسترسی به بردهای کانبان، لیست‌ها و تایم‌لاین وظایف', category: 'tasks' },
  { id: 'tasks.create', label: 'تعریف وظیفه جدید', description: 'ایجاد تسک با زیروظایف، برچسب‌ها، فوریت و پیوست‌ها', category: 'tasks' },
  { id: 'tasks.edit', label: 'ویرایش اطلاعات وظیفه', description: 'تغییر عنوان، توضیحات، تخمین زمان و برچسب‌های تسک', category: 'tasks' },
  { id: 'tasks.assign', label: 'تخصیص و تغییر مسئول وظیفه', description: 'واگذاری تسک به افراد تیم و تغییر مجری', category: 'tasks' },
  { id: 'tasks.status', label: 'تغییر وضعیت وظیفه', description: 'انتقال تسک بین ستون‌های کانبان و تکمیل وظایف', category: 'tasks' },
  { id: 'tasks.delete', label: 'حذف وظایف', description: 'حذف تسک‌های منقضی یا اشتباه از برد پروژه', category: 'tasks' },

  // مدیریت تیم‌ها (Teams)

  // دارایی‌های دیجیتال (DAM - Digital Asset Management)
  { id: 'assets.view', label: 'مشاهده فایل‌ها و پوشه‌ها', description: 'دسترسی به محیط مدیریت دارایی‌های دیجیتال و کاوشگر فایل', category: 'dam' },
  { id: 'assets.preview', label: 'پیش‌نمایش محتوای فایل', description: 'مشاهده فایل‌های تصویری، صوتی، ویدئویی و اسناد بدون نیاز به دانلود', category: 'dam' },
  { id: 'assets.download', label: 'دانلود فایل‌ها', description: 'امکان دانلود مستقیم فایل‌ها و نسخه‌های مختلف', category: 'dam' },
  { id: 'assets.upload', label: 'بارگذاری فایل و ایجاد پوشه', description: 'آپلود فایل‌های جدید به مخزن دارایی‌ها و پوشه‌بندی', category: 'dam' },
  { id: 'assets.edit_info', label: 'ویرایش اطلاعات و متادیتا', description: 'تغییر عنوان، برچسب‌ها، دسته‌بندی و انتساب به پروژه/تسک', category: 'dam' },
  { id: 'assets.rename', label: 'تغییر نام فایل و پوشه', description: 'امکان ویرایش نام فایل‌ها و پوشه‌های مخزن', category: 'dam' },
  { id: 'assets.move', label: 'جابه‌جایی و سازماندهی فایل‌ها', description: 'انتقال فایل‌ها بین پوشه‌ها و ساختارهای دایرکتوری', category: 'dam' },
  { id: 'assets.create_version', label: 'ایجاد نسخه جدید فایل', description: 'بارگذاری نسخه به‌روزرسانی شده با ثبت لاگ تغییرات', category: 'dam' },
  { id: 'assets.delete', label: 'حذف فایل و پوشه', description: 'انتقال فایل‌ها به سطل زباله یا حذف دائمی', category: 'dam' },
  { id: 'assets.restore', label: 'بازیابی از سطل زباله', description: 'بازگردانی فایل‌ها و پوشه‌های حذف شده به وضعیت فعال', category: 'dam' },
  { id: 'assets.share', label: 'اشتراک‌گذاری فایل', description: 'ایجاد لینک اشتراک و ارائه دسترسی به اعضا یا تیم‌ها', category: 'dam' },
  { id: 'assets.manage_access', label: 'مدیریت مجوزها و سطوح دسترسی فایل', description: 'تعیین سطح دسترسی (مشاهده، دانلود، ویرایش، مدیریت)', category: 'dam' },

  // دیدگاه‌ها
  { id: 'comments.edit_any', label: 'ویرایش دیدگاه دیگران', description: 'ویرایش دیدگاه ثبت‌شده توسط سایر کاربران', category: 'comments' },
  { id: 'comments.delete_any', label: 'حذف دیدگاه دیگران', description: 'حذف دیدگاه ثبت‌شده توسط سایر کاربران', category: 'comments' },

  // پیام‌رسان و گفتگوها (Messaging)
  { id: 'messaging.view', label: 'مشاهده گفتگوها و کانال‌ها', description: 'دسترسی به پیام‌رسان سازمانی و مشاهده پیام‌ها', category: 'messaging' },
  { id: 'messaging.create_chat', label: 'ایجاد گروه، کانال و گفتگوی مستقیم', description: 'تشکیل فضاهای گفتگوی تیمی و کانال‌های موضوعی', category: 'messaging' },
  { id: 'messaging.send_message', label: 'ارسال پیام و پیوست', description: 'ارسال پیام متنی، ویس، تصویر و فایل در گفتگوها', category: 'messaging' },
  { id: 'messaging.delete_message', label: 'حذف پیام‌ها', description: 'حذف پیام‌های ارسالی یا پیام‌های گروهی', category: 'messaging' },
  { id: 'messaging.manage_group', label: 'مدیریت اعضا و اختیارات گروه', description: 'افزودن و حذف اعضا و تنظیم اختیارات ارسال پیام', category: 'messaging' },

  // دبیرخانه و مکاتبات اداری (Secretariat)
  { id: 'secretariat.view', label: 'مشاهده نامه‌ها و کارتابل اداری', description: 'دسترسی به فهرست نامه‌های وارده، صادره و داخلی', category: 'secretariat' },
  { id: 'secretariat.create_letter', label: 'ثبت نامه و ایجاد پیش‌نویس', description: 'ثبت مکاتبه جدید با صدور شماره اندیکاتور و پیوست اسناد', category: 'secretariat' },
  { id: 'secretariat.edit_letter', label: 'ویرایش اطلاعات و متن نامه', description: 'تغییر محتوا، فوریت، طبقه‌بندی و پیوست‌های نامه', category: 'secretariat' },
  { id: 'secretariat.delete_letter', label: 'حذف نامه‌ها', description: 'حذف نامه‌های ثبت‌شده اشتباه از کارتابل اداری', category: 'secretariat' },
  { id: 'secretariat.refer_letter', label: 'ارجاع سازمانی و هامش‌نویسی', description: 'ارجاع نامه به اشخاص/تیم‌ها و تعیین مهلت اقدام و دستور کار', category: 'secretariat' },
  { id: 'secretariat.reply_letter', label: 'ثبت پاسخ و عطف مکاتبه', description: 'ایجاد نامه پیرو و پاسخ‌گویی به مکاتبات قبلی', category: 'secretariat' },
  { id: 'secretariat.archive_letter', label: 'بایگانی و مدیریت زونکن‌ها', description: 'طبقه‌بندی اسناد در زونکن‌های بایگانی و کدگذاری اداری', category: 'secretariat' },
  { id: 'secretariat.manage_resolutions', label: 'مدیریت و پیگیری مصوبات', description: 'ثبت مصوبات جلسات هیئت مدیره و تطبیق با تسک‌ها', category: 'secretariat' },

  // اتاق فکر و ایده‌پردازی (Think Tank)
  { id: 'thinktank.view', label: 'مشاهده اتاق فکر و ایده‌ها', description: 'دسترسی به ویترین ایده‌ها و چالش‌ها', category: 'thinktank' },
  { id: 'thinktank.create_idea', label: 'ثبت و پیشنهاد ایده جدید', description: 'ارائه طرح، تشریح مسئله و راه‌حل پیشنهادی به اتاق فکر', category: 'thinktank' },
  { id: 'thinktank.edit_idea', label: 'ویرایش مشخصات ایده', description: 'به‌روزرسانی جزئیات، پیوست‌ها و توضیحات تکمیلی طرح', category: 'thinktank' },
  { id: 'thinktank.delete_idea', label: 'حذف ایده', description: 'حذف ایده‌های نامربوط یا منسوخ شده', category: 'thinktank' },
  { id: 'meetings.view', label: 'مشاهده جلسات', description: 'مشاهده فهرست و جزئیات جلسات', category: 'meetings' },
  { id: 'meetings.create', label: 'ایجاد جلسه', description: 'برنامه‌ریزی جلسه و دعوت اعضا', category: 'meetings' },
  { id: 'meetings.edit', label: 'ویرایش جلسه', description: 'ویرایش برنامه، زمان و اعضای جلسه', category: 'meetings' },
  { id: 'meetings.minutes', label: 'ثبت صورت‌جلسه', description: 'ثبت حاضرین، غایبین، مصوبات و اقدامات جلسه', category: 'meetings' },
  { id: 'meetings.delete', label: 'حذف جلسه', description: 'حذف جلسات برنامه‌ریزی‌شده', category: 'meetings' },
  { id: 'thinktank.vote', label: 'رأی‌دهی و ثبت دیدگاه تخصصی', description: 'شرکت در نظرسنجی‌ها و ثبت ارزیابی و کامنت روی ایده‌ها', category: 'thinktank' },
  { id: 'thinktank.approve_convert', label: 'تأیید ایده و تبدیل به تسک یا پروژه', description: 'تصویب ایده و ارتقای مستقیم آن به پروژه یا وظیفه اجرایی', category: 'thinktank' },

  // گزارش‌ها و تحلیل‌ها (Reports)
  { id: 'reports.view', label: 'مشاهده داشبوردها و گزارش‌های آماری', description: 'دسترسی به نمودارهای پیشرفت، بازدهی و بار کاری پرسنل', category: 'reports' },
  { id: 'reports.export', label: 'استخراج داده‌ها و خروجی اکسل/PDF', description: 'دریافت گزارش‌های مستند و خروجی‌های ساختاریافته', category: 'reports' },
  { id: 'integrity.view', label: 'مشاهده پایش یکپارچگی', description: 'مشاهده گزارش فقط‌خواندنی ناسازگاری‌های عملیاتی', category: 'settings' },

  // تنظیمات سامانه (Settings)
  { id: 'settings.manage', label: 'مدیریت پیکربندی و تنظیمات سامانه', description: 'تنظیمات عمومی سازمان، دوره‌های اسپرینت، تم و امنیت سیستم', category: 'settings' }
];
