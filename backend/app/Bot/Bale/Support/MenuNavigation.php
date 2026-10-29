<?php

namespace App\Bot\Bale\Support;

use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use Carbon\CarbonInterface;

/**
 * مراحلِ «جریان باز» در بات.
 *
 * قاعدهٔ اصلی: تا کاربر خودش با «لغو» یا «بازگشت به منو» از جریان بیرون نرود،
 * نشستِ جریان پاک یا جایگزین نمی‌شود. پیش‌تر چند مسیر (خطای پردازش، انقضای
 * کوتاهِ نشست و کلیک روی دکمه‌های منو) نشست را پاک می‌کردند و کاربر وسطِ ثبت
 * ردیف جدول یا دریافت متن، خود را در «منوی اصلی» می‌دید و همهٔ پاسخ‌هایش از
 * دست می‌رفت.
 */
final class MenuNavigation
{
    /** مراحلی که یک فرمِ ناتمام دارند و باید دکمهٔ «لغو» بگیرند. */
    public const DRAFTING = ['unlink', 'report_text', 'report_confirm', 'status_select', 'status_confirm', 'done_confirm',
        'edit_value', 'edit_confirm', 'asset_field', 'asset_confirm', 'text_asset_title', 'text_asset_body', 'text_asset_confirm',
        'asset_file', 'asset_file_title', 'asset_file_confirm', 'publish_confirm',
        'output_text', 'output_confirm', 'output_file', 'output_file_confirm'];

    /** نامِ فارسیِ هر مرحله؛ برای پیام‌های «جریان باز است» و یادآوریِ ادامه. */
    private const LABELS = [
        'unlink' => 'قطع اتصال حساب',
        'asset_context' => 'انتخاب جدول اطلاعات',
        'report_text' => 'ثبت گزارش',
        'report_confirm' => 'تأیید گزارش',
        'status_select' => 'تغییر وضعیت',
        'status_confirm' => 'تأیید وضعیت',
        'done_confirm' => 'تکمیل وظیفه',
        'edit_value' => 'ویرایش وظیفه',
        'edit_confirm' => 'تأیید ویرایش',
        'asset_field' => 'ثبت ردیف جدول اطلاعات',
        'asset_confirm' => 'تأیید ردیف جدول',
        'text_asset_title' => 'ثبت دارایی متنی',
        'text_asset_body' => 'متن دارایی',
        'text_asset_confirm' => 'تأیید دارایی متنی',
        'asset_file' => 'دریافت فایل در بات',
        'asset_file_title' => 'عنوان فایل دریافتی',
        'asset_file_confirm' => 'تأیید ثبت فایل',
        'publish_confirm' => 'ثبت انتشار',
        'output_text' => 'ثبت خروجی محتوا',
        'output_confirm' => 'تأیید خروجی محتوا',
        'output_file' => 'دریافت فایل خروجی',
        'output_file_confirm' => 'تأیید خروجی فایل',
    ];

    /**
     * اقدام‌هایی که یک جریانِ تازه باز می‌کنند یا کاربر را از جریان بیرون
     * می‌برند. هنگام باز بودنِ جریان مسدود می‌شوند تا پیش‌نویس از دست نرود؛
     * «home»، «cancel»، «restart» و «task:» استثنا هستند (خروجِ صریحِ کاربر).
     */
    private const LEAVING = '/^(tasks?(?::|$)|taskfilters$|projects?(?::|$)|meetings?(?::|$)|profile$|help$|unlink$'
        .'|assets?(?::|$)|taskasset:|assetfile:|assetsend:|assettext:|asseturl:|assetrows(?::|$)|tableform:|departmentform:'
        .'|departmenttables:|assettable:|pubout(?::|$)|pubinfo:|status:|report:|done:|edit:|editfield:)/';

    /** برچسبِ فارسی مرحلهٔ جاری؛ برای پیامِ «شما در میانهٔ … هستید». */
    public static function label(?BaleConversation $session): string
    {
        return self::LABELS[(string) $session?->step] ?? 'یک فرم ناتمام';
    }

    /**
     * راهنمای کوتاهِ «الان چه بفرستم؟» برای هر مرحله.
     *
     * کاربر نباید حدس بزند بات منتظر متن است یا پرونده؛ پیش‌تر پاسخِ نامربوط فقط
     * یک پیامِ کلی می‌گرفت.
     */
    public static function hint(?BaleConversation $session): string
    {
        return match ((string) $session?->step) {
            'asset_file' => 'منتظر پرونده‌ام: فایل، عکس، ویدیو، صدا یا سند (pdf و…) را همین‌جا در گفتگو بفرستید.',
            'asset_file_title' => 'عنوان دارایی را بنویسید؛ اگر نام پرونده کافی است فقط «-» بفرستید.',
            'asset_file_confirm' => 'برای ثبت، «✅ تأیید ثبت دارایی» را بزنید یا پوشهٔ مقصد را انتخاب کنید.',
            'asset_context' => 'جدول موردنظر را از دکمه‌های همین پیام انتخاب کنید.',
            'asset_field' => 'مقدار همین فیلد را بنویسید؛ برای فیلد اختیاری می‌توانید «-» بفرستید.',
            'asset_confirm' => 'برای ثبت ردیف، دکمهٔ تأییدِ آخرین پیام را بزنید.',
            'text_asset_title', 'text_asset_body', 'output_text', 'report_text', 'edit_value' => 'متن درخواستی را بنویسید.',
            'text_asset_confirm', 'output_confirm', 'output_file_confirm', 'edit_confirm', 'status_select', 'status_confirm', 'done_confirm', 'report_confirm', 'publish_confirm', 'unlink' => 'برای ادامه از دکمه‌های آخرین پیام استفاده کنید.',
            'output_file' => 'پروندهٔ خروجی را همین‌جا در گفتگو بفرستید.',
            default => 'از دکمه‌های آخرین پیام استفاده کنید یا «لغو» را بزنید.',
        };
    }

    public static function drafting(?BaleConversation $session): bool
    {
        return $session && in_array($session->step, self::DRAFTING, true);
    }

    /**
     * آیا کاربر داخل **هر** جریانی است؟ (شاملِ صفحهٔ انتخاب، مثل انتخاب جدول)
     *
     * `drafting()` فقط فرم‌هایی را می‌گوید که پاسخِ متنی می‌گیرند؛ صفحهٔ انتخاب
     * جدول (`asset_context`) هم یک جریانِ باز است و پیش‌تر هنگامِ فرستادنِ متن یا
     * کلیکِ دکمهٔ کهنه، کاربر را به «منوی اصلی» پرت می‌کرد.
     */
    public static function active(?BaleConversation $session): bool
    {
        return $session !== null;
    }

    /**
     * آیا این اقدام، کاربر را از جریانِ باز بیرون می‌برد؟
     *
     * خروجِ صریح (منوی اصلی، لغو، شروع مجدد و بازگشت به تسک) مسدود نمی‌شود؛
     * بقیهٔ اقدام‌های «رفتن به بخش دیگر» تا پایانِ جریان مسدود می‌شوند.
     */
    public static function leavesFlow(string $action): bool
    {
        if (in_array($action, ['home', 'cancel', 'restart'], true) || str_starts_with($action, 'task:')) {
            return false;
        }

        return (bool) preg_match(self::LEAVING, $action);
    }

    /** عمرِ نشستِ جریان: عملیاتِ طولانی (مثل نوشتن متن یا فرستادن فایل) نباید نیمه‌کاره بمیرد. */
    public static function lifetime(): CarbonInterface
    {
        $minutes = (int) config('bale.session_lifetime_minutes', 60);

        return now()->addMinutes(max(15, $minutes));
    }

    /**
     * با هر تعامل، عمرِ جریان تمدید می‌شود؛ نشست در میانهٔ کار منقضی نمی‌شود.
     *
     * صفحهٔ انتخاب (مثل انتخاب جدول) هم جریان است و همان‌قدر باید زنده بماند.
     */
    public static function touch(?BaleConversation $session): void
    {
        if (self::active($session) && $session->expires_at?->lt(now()->addMinutes(5))) {
            $session->update(['expires_at' => self::lifetime()]);
        }
    }

    public static function rows(?BaleUserLink $link, bool $home = false): array
    {
        if (! $link || $home) {
            return [];
        }
        $buttons = [['text' => 'بازگشت به منو', 'callback_data' => 'home']];
        if (self::active(BaleConversation::where('link_id', $link->id)->first())) {
            $buttons[] = ['text' => 'لغو', 'callback_data' => 'cancel'];
        }

        return [$buttons];
    }
}
