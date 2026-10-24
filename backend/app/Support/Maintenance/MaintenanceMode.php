<?php

namespace App\Support\Maintenance;

use App\Models\SystemSetting;
use App\Models\User;
use App\Support\OrganizationTime;
use Throwable;

/**
 * «حالت تعمیر» سامانه.
 *
 * وقتی مدیر کل سیستم آن را روشن می‌کند، هر کاربری که نقش مدیریت کل سیستم
 * (`admin`) را ندارد — حتی اگر پیش‌تر وارد شده باشد — از سامانه بیرون می‌ماند و
 * صفحهٔ «در حال تعمیر» را می‌بیند. وضعیت در تنظیمات سازمانی (کلید `maintenance`)
 * ذخیره می‌شود تا با پشتیبان‌گیری و انتقال بین محیط‌ها همراه باشد و از پنل، بدون
 * دسترسی به فایل یا SSH، قابل تغییر باشد.
 *
 * این کلاس تنها مرجع تصمیم است: میان‌افزار API، ورود، و صفحهٔ عمومی همگی از همین
 * `state()` می‌خوانند تا هیچ مسیری با تشخیصِ متفاوت باز نماند.
 */
final class MaintenanceMode
{
    /** کلید تنظیمات سازمانی؛ فقط مدیر کل سیستم آن را می‌خواند/می‌نویسد. */
    public const KEY = 'maintenance';

    /** کد پاسخ API؛ فرانت‌اند با همین کد صفحهٔ تعمیر را نشان می‌دهد. */
    public const CODE = 'maintenance_mode';

    public const DEFAULT_MESSAGE = 'سامانه در حال به‌روزرسانی و تعمیر است؛ لطفاً چند دقیقهٔ دیگر دوباره تلاش کنید.';

    /** @var array{enabled: bool, message: string, startedAt: ?string, updatedBy: ?string}|null */
    private ?array $state = null;

    /** @return array{enabled: bool, message: string, startedAt: ?string, updatedBy: ?string} */
    public function state(): array
    {
        return $this->state ??= $this->read();
    }

    public function enabled(): bool
    {
        return $this->state()['enabled'];
    }

    /** پیامِ نمایشی؛ پیامِ خالی به متنِ پیش‌فرض برمی‌گردد تا صفحه هرگز بی‌متن نباشد. */
    public function message(): string
    {
        $message = trim((string) $this->state()['message']);

        return $message !== '' ? $message : self::DEFAULT_MESSAGE;
    }

    public function startedAt(): ?string
    {
        return $this->state()['startedAt'];
    }

    /**
     * آیا این کاربر باید به‌جای سامانه، حالت تعمیر را ببیند؟
     *
     * نقش مدیریت کل سیستم همیشه راه دارد؛ در نبودِ کاربر (مهمان) حالت تعمیر
     * فعال است، چون ورودِ کاربرانِ عادی هم مسدود می‌شود.
     */
    public function blocks(?User $user): bool
    {
        if (! $this->enabled()) {
            return false;
        }

        return ! ($user?->isAdmin() ?? false);
    }

    /** @return array{enabled: bool, message: string, startedAt: ?string} */
    public function publicState(): array
    {
        return [
            'enabled' => $this->enabled(),
            'message' => $this->message(),
            'startedAt' => $this->startedAt(),
        ];
    }

    /** پاسخ یکسان برای همهٔ مسیرهای مسدود (ورود، API و بقیه). */
    public function response(?string $extraMessage = null): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'message' => $extraMessage ?: $this->message(),
            'code' => self::CODE,
            'data' => ['maintenance' => $this->publicState()],
        ], 503)->header('Cache-Control', 'no-store, private');
    }

    /** پس از هر تغییر تنظیمات، حافظهٔ همان درخواست پاک می‌شود. */
    public function forget(): void
    {
        $this->state = null;
    }

    /**
     * مقدارِ ذخیره‌شده را می‌خواند و به شکلِ قطعی درمی‌آورد.
     *
     * خطای خواندن (مثلاً پیش از اجرای مایگریشن‌ها) حالت تعمیر را روشن نمی‌کند؛
     * قفل‌شدنِ ناخواستهٔ سامانه بدتر از نادیده‌گرفتنِ یک تنظیم است.
     *
     * @return array{enabled: bool, message: string, startedAt: ?string, updatedBy: ?string}
     */
    private function read(): array
    {
        $stored = [];
        try {
            $setting = SystemSetting::query()->where('key', self::KEY)->first();
            $value = $setting?->value;
            if (is_string($value)) {
                $value = json_decode($value, true);
            }
            $stored = is_array($value) ? $value : [];
        } catch (Throwable) {
            $stored = [];
        }

        return [
            'enabled' => filter_var($stored['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'message' => is_string($stored['message'] ?? null) ? mb_substr($stored['message'], 0, 500) : '',
            'startedAt' => is_string($stored['startedAt'] ?? null) && $stored['startedAt'] !== '' ? $stored['startedAt'] : null,
            'updatedBy' => is_string($stored['updatedBy'] ?? null) && $stored['updatedBy'] !== '' ? $stored['updatedBy'] : null,
        ];
    }

    /** زمانِ فعلیِ سازمان برای مهرِ شروع/پایان حالت تعمیر. */
    public function now(): string
    {
        try {
            return app(OrganizationTime::class)->now()->toIso8601String();
        } catch (Throwable) {
            return now()->toIso8601String();
        }
    }
}
