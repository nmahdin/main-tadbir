<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * دسترسی‌های پایه سامانه تدبیر.
 *
 * کلیدهای این فهرست با SYSTEM_PERMISSIONS در فرانت‌اند (src/data/initialData.ts) یکسان است؛
 * هر دسترسی جدیدی که در فرانت‌اند اضافه می‌شود باید اینجا هم ثبت شود تا ماتریس نقش‌ها کامل بماند.
 */
class PermissionSeeder extends Seeder
{
    /**
     * @var array<int, array{key: string, label: string, description: string, category: string}>
     */
    public const PERMISSIONS = [
        ['key' => 'departments.view', 'label' => 'مشاهده دپارتمان‌ها', 'description' => 'مشاهده ساختار درختی و لیست دپارتمان‌ها', 'category' => 'departments'],
        ['key' => 'departments.create', 'label' => 'ایجاد دپارتمان', 'description' => 'تعریف دپارتمان جدید در ساختار سازمانی', 'category' => 'departments'],
        ['key' => 'departments.edit', 'label' => 'ویرایش دپارتمان', 'description' => 'ویرایش مشخصات و مدیر دپارتمان', 'category' => 'departments'],
        ['key' => 'departments.delete', 'label' => 'حذف دپارتمان', 'description' => 'حذف دپارتمان', 'category' => 'departments'],
        ['key' => 'departments.manage_members', 'label' => 'مدیریت اعضای دپارتمان', 'description' => 'افزودن، ویرایش و حذف اعضای دپارتمان', 'category' => 'departments'],
        ['key' => 'content.view', 'label' => 'مشاهده محتواها', 'description' => 'مشاهده لیست تولیدات محتوایی', 'category' => 'content'],
        ['key' => 'content.create', 'label' => 'ایجاد محتوا', 'description' => 'ثبت ایده و برنامه تولید محتوای جدید', 'category' => 'content'],
        ['key' => 'content.edit', 'label' => 'ویرایش محتوا', 'description' => 'ویرایش اطلاعات و وضعیت محتوا', 'category' => 'content'],
        ['key' => 'content.delete', 'label' => 'حذف محتوا', 'description' => 'حذف محتوا', 'category' => 'content'],
        ['key' => 'content.review', 'label' => 'بازبینی محتوا', 'description' => 'ثبت نظر بازبینی و درخواست اصلاح', 'category' => 'content'],
        ['key' => 'content.approve', 'label' => 'تأیید نهایی محتوا', 'description' => 'تأیید کیفی و انتشار محتوا', 'category' => 'content'],
        ['key' => 'content.publish', 'label' => 'مدیریت انتشار', 'description' => 'زمان‌بندی و تغییر وضعیت انتشار', 'category' => 'content'],
        ['key' => 'content.manage_process', 'label' => 'مدیریت فرآیند تولید محتوا', 'description' => 'تعریف و ویرایش مراحل گردش کار تولید محتوا و تعیین مسئول هر مرحله', 'category' => 'content'],
        ['key' => 'workflows.manage', 'label' => 'مدیریت گردش کارها', 'description' => 'مشاهده، ایجاد و ویرایش مراحل گردش کار', 'category' => 'workflows'],
        ['key' => 'users.view', 'label' => 'مشاهده لیست کاربران', 'description' => 'امکان مشاهده اسامی، اطلاعات هویتی و عناوین سازمانی', 'category' => 'users'],
        ['key' => 'users.view_details', 'label' => 'مشاهده جزئیات و پروفایل کاربر', 'description' => 'دسترسی به لاگ‌ها، مهارت‌ها، سوابق ورود و اطلاعات تماس', 'category' => 'users'],
        ['key' => 'users.create', 'label' => 'ایجاد کاربر جدید', 'description' => 'امکان تعریف کاربر جدید، تعیین رمز عبور موقت و ارسال مشخصات', 'category' => 'users'],
        ['key' => 'users.edit', 'label' => 'ویرایش مشخصات کاربر', 'description' => 'ویرایش نام، ایمیل، دپارتمان، مهارت‌ها و نقش سازمانی', 'category' => 'users'],
        ['key' => 'users.status', 'label' => 'تغییر وضعیت و مسدودسازی', 'description' => 'امکان فعال‌سازی، غیرفعال‌سازی، تعلیق و مسدودسازی حساب', 'category' => 'users'],
        ['key' => 'users.delete', 'label' => 'حذف کاربر از سیستم', 'description' => 'حذف دائمی رکورد کاربر از سامانه تدبیر', 'category' => 'users'],
        ['key' => 'roles.view', 'label' => 'مشاهده لیست نقش‌ها', 'description' => 'مشاهده نقش‌های سیستمی و سفارشی و تعداد کاربران منتسب', 'category' => 'roles'],
        ['key' => 'roles.create', 'label' => 'تعریف نقش جدید', 'description' => 'ایجاد نقش سازمانی جدید با عنوان و رنگ اختصاصی', 'category' => 'roles'],
        ['key' => 'roles.edit', 'label' => 'ویرایش مشخصات نقش', 'description' => 'تغییر نام، رنگ و توضیحات نقش‌های سازمانی', 'category' => 'roles'],
        ['key' => 'roles.manage_permissions', 'label' => 'مدیریت مجوزها و ماتریس دسترسی', 'description' => 'تخصیص یا سلب دسترسی‌های عملیاتی از نقش‌ها', 'category' => 'roles'],
        ['key' => 'roles.delete', 'label' => 'حذف نقش سازمانی', 'description' => 'حذف نقش‌های سفارشی تعریف شده', 'category' => 'roles'],
        ['key' => 'projects.view', 'label' => 'مشاهده پروژه‌ها', 'description' => 'دسترسی به فهرست پروژه‌ها و جزئیات پیشرفت', 'category' => 'projects'],
        ['key' => 'projects.create', 'label' => 'ایجاد پروژه جدید', 'description' => 'تعریف پروژه با الگوهای سفارشی، بودجه و تیم', 'category' => 'projects'],
        ['key' => 'projects.edit', 'label' => 'ویرایش مشخصات پروژه', 'description' => 'تغییر تاریخ‌ها، وضعیت، بودجه، مدیر پروژه و اعضا', 'category' => 'projects'],
        ['key' => 'projects.delete', 'label' => 'حذف و بایگانی پروژه', 'description' => 'آرشیو کردن یا حذف کامل پروژه و اطلاعات آن', 'category' => 'projects'],
        ['key' => 'tasks.view', 'label' => 'مشاهده وظایف', 'description' => 'دسترسی به بردهای کانبان، لیست‌ها و تایم‌لاین وظایف', 'category' => 'tasks'],
        ['key' => 'tasks.create', 'label' => 'تعریف وظیفه جدید', 'description' => 'ایجاد تسک با زیروظایف، برچسب‌ها، فوریت و پیوست‌ها', 'category' => 'tasks'],
        ['key' => 'tasks.edit', 'label' => 'ویرایش اطلاعات وظیفه', 'description' => 'تغییر عنوان، توضیحات، تخمین زمان و برچسب‌های تسک', 'category' => 'tasks'],
        ['key' => 'tasks.assign', 'label' => 'تخصیص و تغییر مسئول وظیفه', 'description' => 'واگذاری تسک به افراد تیم و تغییر مجری', 'category' => 'tasks'],
        ['key' => 'tasks.status', 'label' => 'تغییر وضعیت وظیفه', 'description' => 'انتقال تسک بین ستون‌های کانبان و تکمیل وظایف', 'category' => 'tasks'],
        ['key' => 'tasks.delete', 'label' => 'حذف وظایف', 'description' => 'حذف تسک‌های منقضی یا اشتباه از برد پروژه', 'category' => 'tasks'],
        ['key' => 'teams.view', 'label' => 'مشاهده ساختار تیم‌ها', 'description' => 'دیدن اعضا، دپارتمان‌ها و سرپرستان تیم', 'category' => 'teams'],
        ['key' => 'teams.create', 'label' => 'ایجاد تیم جدید', 'description' => 'تشکیل کارگروه‌ها و تیم‌های تخصصی سازمانی', 'category' => 'teams'],
        ['key' => 'teams.edit', 'label' => 'ویرایش و تخصیص اعضای تیم', 'description' => 'جابجایی اعضا، تعیین سرپرست و تغییر دپارتمان', 'category' => 'teams'],
        ['key' => 'teams.delete', 'label' => 'انحلال یا حذف تیم', 'description' => 'حذف کارگروه و آزادسازی اعضا', 'category' => 'teams'],
        ['key' => 'assets.view', 'label' => 'مشاهده فایل‌ها و پوشه‌ها', 'description' => 'دسترسی به محیط مدیریت دارایی‌های دیجیتال و کاوشگر فایل', 'category' => 'dam'],
        ['key' => 'assets.preview', 'label' => 'پیش‌نمایش محتوای فایل', 'description' => 'مشاهده فایل‌های تصویری، صوتی، ویدئویی و اسناد بدون نیاز به دانلود', 'category' => 'dam'],
        ['key' => 'assets.download', 'label' => 'دانلود فایل‌ها', 'description' => 'امکان دانلود مستقیم فایل‌ها و نسخه‌های مختلف', 'category' => 'dam'],
        ['key' => 'assets.upload', 'label' => 'بارگذاری فایل و ایجاد پوشه', 'description' => 'آپلود فایل‌های جدید به مخزن دارایی‌ها و پوشه‌بندی', 'category' => 'dam'],
        ['key' => 'assets.edit_info', 'label' => 'ویرایش اطلاعات و متادیتا', 'description' => 'تغییر عنوان، برچسب‌ها، دسته‌بندی و انتساب به پروژه/تسک', 'category' => 'dam'],
        ['key' => 'assets.rename', 'label' => 'تغییر نام فایل و پوشه', 'description' => 'امکان ویرایش نام فایل‌ها و پوشه‌های مخزن', 'category' => 'dam'],
        ['key' => 'assets.move', 'label' => 'جابه‌جایی و سازماندهی فایل‌ها', 'description' => 'انتقال فایل‌ها بین پوشه‌ها و ساختارهای دایرکتوری', 'category' => 'dam'],
        ['key' => 'assets.create_version', 'label' => 'ایجاد نسخه جدید فایل', 'description' => 'بارگذاری نسخه به‌روزرسانی شده با ثبت لاگ تغییرات', 'category' => 'dam'],
        ['key' => 'assets.delete', 'label' => 'حذف فایل و پوشه', 'description' => 'انتقال فایل‌ها به سطل زباله یا حذف دائمی', 'category' => 'dam'],
        ['key' => 'assets.restore', 'label' => 'بازیابی از سطل زباله', 'description' => 'بازگردانی فایل‌ها و پوشه‌های حذف شده به وضعیت فعال', 'category' => 'dam'],
        ['key' => 'assets.share', 'label' => 'اشتراک‌گذاری فایل', 'description' => 'ایجاد لینک اشتراک و ارائه دسترسی به اعضا یا تیم‌ها', 'category' => 'dam'],
        ['key' => 'assets.manage_access', 'label' => 'مدیریت مجوزها و سطوح دسترسی فایل', 'description' => 'تعیین سطح دسترسی (مشاهده، دانلود، ویرایش، مدیریت)', 'category' => 'dam'],
        ['key' => 'messaging.view', 'label' => 'مشاهده گفتگوها و کانال‌ها', 'description' => 'دسترسی به پیام‌رسان سازمانی و مشاهده پیام‌ها', 'category' => 'messaging'],
        ['key' => 'messaging.create_chat', 'label' => 'ایجاد گروه، کانال و گفتگوی مستقیم', 'description' => 'تشکیل فضاهای گفتگوی تیمی و کانال‌های موضوعی', 'category' => 'messaging'],
        ['key' => 'messaging.send_message', 'label' => 'ارسال پیام و پیوست', 'description' => 'ارسال پیام متنی، ویس، تصویر و فایل در گفتگوها', 'category' => 'messaging'],
        ['key' => 'messaging.delete_message', 'label' => 'حذف پیام‌ها', 'description' => 'حذف پیام‌های ارسالی یا پیام‌های گروهی', 'category' => 'messaging'],
        ['key' => 'messaging.manage_group', 'label' => 'مدیریت اعضا و اختیارات گروه', 'description' => 'افزودن و حذف اعضا و تنظیم اختیارات ارسال پیام', 'category' => 'messaging'],
        ['key' => 'secretariat.view', 'label' => 'مشاهده نامه‌ها و کارتابل اداری', 'description' => 'دسترسی به فهرست نامه‌های وارده، صادره و داخلی', 'category' => 'secretariat'],
        ['key' => 'secretariat.create_letter', 'label' => 'ثبت نامه و ایجاد پیش‌نویس', 'description' => 'ثبت مکاتبه جدید با صدور شماره اندیکاتور و پیوست اسناد', 'category' => 'secretariat'],
        ['key' => 'secretariat.edit_letter', 'label' => 'ویرایش اطلاعات و متن نامه', 'description' => 'تغییر محتوا، فوریت، طبقه‌بندی و پیوست‌های نامه', 'category' => 'secretariat'],
        ['key' => 'secretariat.refer_letter', 'label' => 'ارجاع سازمانی و هامش‌نویسی', 'description' => 'ارجاع نامه به اشخاص/تیم‌ها و تعیین مهلت اقدام و دستور کار', 'category' => 'secretariat'],
        ['key' => 'secretariat.reply_letter', 'label' => 'ثبت پاسخ و عطف مکاتبه', 'description' => 'ایجاد نامه پیرو و پاسخ‌گویی به مکاتبات قبلی', 'category' => 'secretariat'],
        ['key' => 'secretariat.archive_letter', 'label' => 'بایگانی و مدیریت زونکن‌ها', 'description' => 'طبقه‌بندی اسناد در زونکن‌های بایگانی و کدگذاری اداری', 'category' => 'secretariat'],
        ['key' => 'secretariat.manage_resolutions', 'label' => 'مدیریت و پیگیری مصوبات', 'description' => 'ثبت مصوبات جلسات هیئت مدیره و تطبیق با تسک‌ها', 'category' => 'secretariat'],
        ['key' => 'thinktank.view', 'label' => 'مشاهده ایده‌ها و اتاق فکر', 'description' => 'دسترسی به ویترین ایده‌ها، چالش‌ها و جلسات بارش فکری', 'category' => 'thinktank'],
        ['key' => 'thinktank.create_idea', 'label' => 'ثبت و پیشنهاد ایده جدید', 'description' => 'ارائه طرح، تشریح مسئله و راه‌حل پیشنهادی به اتاق فکر', 'category' => 'thinktank'],
        ['key' => 'thinktank.edit_idea', 'label' => 'ویرایش مشخصات ایده', 'description' => 'به‌روزرسانی جزئیات، پیوست‌ها و توضیحات تکمیلی طرح', 'category' => 'thinktank'],
        ['key' => 'thinktank.delete_idea', 'label' => 'حذف ایده', 'description' => 'حذف ایده‌های نامربوط یا منسوخ شده', 'category' => 'thinktank'],
        ['key' => 'thinktank.manage_meetings', 'label' => 'برگزاری و مدیریت جلسات هم‌اندیشی', 'description' => 'تعریف جلسه بارش فکری، ثبت صورتجلسه و تصمیمات', 'category' => 'thinktank'],
        ['key' => 'thinktank.vote', 'label' => 'رأی‌دهی و ثبت دیدگاه تخصصی', 'description' => 'شرکت در نظرسنجی‌ها و ثبت ارزیابی و کامنت روی ایده‌ها', 'category' => 'thinktank'],
        ['key' => 'thinktank.approve_convert', 'label' => 'تأیید ایده و تبدیل به تسک یا پروژه', 'description' => 'تصویب ایده و ارتقای مستقیم آن به پروژه یا وظیفه اجرایی', 'category' => 'thinktank'],
        ['key' => 'reports.view', 'label' => 'مشاهده داشبوردها و گزارش‌های آماری', 'description' => 'دسترسی به نمودارهای پیشرفت، بازدهی و بار کاری پرسنل', 'category' => 'reports'],
        ['key' => 'reports.export', 'label' => 'استخراج داده‌ها و خروجی اکسل/PDF', 'description' => 'دریافت گزارش‌های مستند و خروجی‌های ساختاریافته', 'category' => 'reports'],
        ['key' => 'settings.manage', 'label' => 'مدیریت پیکربندی و تنظیمات سامانه', 'description' => 'تنظیمات عمومی سازمان، دوره‌های اسپرینت، تم و امنیت سیستم', 'category' => 'settings'],
    ];

    public function run(): void
    {
        foreach (self::PERMISSIONS as $permission) {
            Permission::updateOrCreate(
                ['key' => $permission['key']],
                $permission,
            );
        }
    }
}
