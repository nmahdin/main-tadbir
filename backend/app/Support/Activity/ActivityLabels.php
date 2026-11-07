<?php

namespace App\Support\Activity;

/**
 * ترجمهٔ کدهای فنی رویداد به برچسب فارسی.
 *
 * برخی رویدادها با کد ماشینی ثبت می‌شوند (`bale_settings_changed`) تا فیلتر و
 * پایش ساده بماند. همان کد هرگز نباید در فید کاربر دیده شود: اینجا یک منبع
 * واحد ترجمه داریم و همهٔ نمایش‌دهنده‌ها (فید فعالیت‌ها، تاریخچهٔ دارایی) از آن
 * استفاده می‌کنند. کد ناشناخته به متن عمومی فارسی تبدیل می‌شود، نه به کد خام.
 */
final class ActivityLabels
{
    /** @var array<string, string> */
    private const ACTIONS = [
        // ربات بله
        'bale_token_changed' => 'توکن ربات بله تغییر کرد',
        'bale_settings_changed' => 'تنظیمات ربات بله ذخیره شد',
        'bale_automations_changed' => 'خودکارسازی‌های ربات بله تغییر کرد',
        'bale_account_linked' => 'حساب بله کاربر به سامانه متصل شد',
        'bale_account_unlinked' => 'اتصال حساب بله کاربر قطع شد',
        'bale_preferences_changed' => 'دسته‌بندی اعلان‌های بله تغییر کرد',
        'bale_disconnected' => 'اتصال ربات بله حذف شد',
        'bale_disconnected_local_only' => 'تنظیمات بله فقط در سامانه پاک شد؛ اتصال بیرونی دست‌نخورده ماند',
        'bale_webhook_rotated' => 'آدرس امن دریافت خودکار بله تعویض شد',
        'bale_webhook_activation_requested' => 'فعال‌سازی دریافت خودکار بله ثبت شد',
        'bale_meeting_reminder' => 'یادآوری جلسه از بله ارسال شد',
        'bale_created' => 'دارایی از ربات بله ساخته شد',
        'bale_asset_access_changed' => 'دسترسی دپارتمانی دارایی تغییر کرد',

        // دارایی‌های دیجیتال
        'duplicate_reused' => 'نسخهٔ تکراری موجود بازاستفاده شد',
        'dam_table_departments_changed' => 'دپارتمان‌های جدول دارایی تغییر کرد',

        // نقش‌ها و دسترسی‌ها
        'role_created' => 'نقش تازه ساخته شد',
        'role_updated' => 'نقش ویرایش شد',
        'role_permissions_updated' => 'مجوزهای نقش تغییر کرد',
        'role_deleted' => 'نقش حذف شد',
    ];

    /** متن خوانا برای یک رکورد فعالیت: اول کد، بعد نوع، در نهایت متن عمومی. */
    public static function action(?string $action, ?string $type = null): string
    {
        $action = trim((string) $action);

        if ($action !== '') {
            if (isset(self::ACTIONS[$action])) {
                return self::ACTIONS[$action];
            }

            // هر متن داری حرف فارسی، از قبل خوانا است و دست‌نخورده می‌ماند.
            if (! self::looksLikeCode($action)) {
                return $action;
            }
        }

        $type = trim((string) $type);

        if ($type !== '' && isset(self::ACTIONS[$type])) {
            return self::ACTIONS[$type];
        }

        return 'رویداد سامانه';
    }

    /** آیا این متن کد ماشینی است (هیچ حرف فارسی/عربی ندارد)؟ */
    public static function looksLikeCode(string $text): bool
    {
        return preg_match('/\p{Arabic}/u', $text) !== 1;
    }
}
