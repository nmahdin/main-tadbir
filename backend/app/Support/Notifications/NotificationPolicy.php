<?php

namespace App\Support\Notifications;

use App\Models\SystemSetting;
use App\Services\Organization\OrganizationSettings;
use Throwable;

/**
 * سیاست سازمانی اعلان‌ها، خوانده‌شده از تنظیمات سامانه (`system_settings.notifications`).
 *
 * همین مقادیر در تب «اعلان‌ها و هشدارها»ی تنظیمات ویرایش می‌شوند و سرویس‌های
 * ارسال اعلان (یادآوری سرسید و اشاره‌ها) واقعاً از آن‌ها پیروی می‌کنند؛ بنابراین
 * کلید خاموش‌کردن یک هشدار، فقط ظاهری نیست.
 */
final class NotificationPolicy
{
    public const KEY = 'notifications';

    /** @var array<string, bool>|null */
    private static ?array $values = null;

    /** آیا این هشدار در سطح سازمان فعال است؟ */
    public static function enabled(string $flag): bool
    {
        $values = self::values();
        $default = (bool) (OrganizationSettings::DEFAULTS[self::KEY][$flag] ?? true);

        return array_key_exists($flag, $values) ? (bool) $values[$flag] : $default;
    }

    /** @return array<string, bool> */
    public static function values(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        try {
            $stored = SystemSetting::query()->where('key', self::KEY)->value('value');
        } catch (Throwable) {
            return self::$values = [];
        }

        if (is_string($stored)) {
            $decoded = json_decode($stored, true);
            $stored = is_array($decoded) ? $decoded : [];
        }

        return self::$values = is_array($stored) ? $stored : [];
    }

    public static function forget(): void
    {
        self::$values = null;
    }
}
