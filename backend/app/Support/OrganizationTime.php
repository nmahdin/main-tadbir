<?php

namespace App\Support;

use App\Models\SystemSetting;
use App\Services\Organization\OrganizationSettings;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Throwable;

/**
 * زمانِ سازمانی برای تاریخ‌ها و ساعت‌هایی که کاربر می‌بیند.
 *
 * منطقهٔ زمانیِ PHP سرور UTC است، اما تاریخِ انتشار، مهلت‌ها و زمانِ ثبتِ
 * رویدادها باید با منطقهٔ زمانیِ سازمان (در تنظیماتِ عمومی، پیش‌فرض
 * `Asia/Tehran`) ثبت شوند؛ در غیر این صورت در نیمهٔ اولِ شب، تاریخ یک روز
 * عقب‌تر و ساعت سه و نیم ساعت جابه‌جا ذخیره می‌شد. مقدارِ تنظیمات همیشه با
 * فهرستِ منطقه‌های زمانیِ معتبر سنجیده می‌شود و مقدارِ نامعتبر به پیش‌فرض
 * برمی‌گردد؛ هیچ رشته‌ای به‌عنوان منطقهٔ زمانی ساخته یا حدس زده نمی‌شود.
 */
final class OrganizationTime
{
    public const FALLBACK = 'Asia/Tehran';

    private ?string $zone = null;

    /** نام منطقهٔ زمانیِ سازمان؛ فقط یکی از منطقه‌های زمانیِ معتبر PHP. */
    public function zone(): string
    {
        if ($this->zone !== null) {
            return $this->zone;
        }
        $candidate = null;
        try {
            $stored = SystemSetting::query()->where('key', 'general')->value('value');
            $general = app(OrganizationSettings::class)->hydrate('general', $stored);
            $candidate = is_string($general['timezone'] ?? null) ? trim($general['timezone']) : null;
        } catch (Throwable) {
            $candidate = null;
        }
        if (! is_string($candidate) || $candidate === '' || ! in_array($candidate, timezone_identifiers_list(), true)) {
            $candidate = self::FALLBACK;
        }

        return $this->zone = $candidate;
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->zone());
    }

    public function today(): CarbonImmutable
    {
        return $this->now()->startOfDay();
    }

    /** تاریخِ میلادیِ یک لحظه (پیش‌فرض: همین حالا) در منطقهٔ زمانیِ سازمان. */
    public function date(?DateTimeInterface $moment = null): string
    {
        return $this->cast($moment)->toDateString();
    }

    /** ساعتِ یک لحظه (پیش‌فرض: همین حالا) در منطقهٔ زمانیِ سازمان؛ `H:i`. */
    public function time(?DateTimeInterface $moment = null): string
    {
        return $this->cast($moment)->format('H:i');
    }

    private function cast(?DateTimeInterface $moment): CarbonImmutable
    {
        $resolved = $moment ?? $this->now();

        return $resolved instanceof CarbonImmutable
            ? $resolved->setTimezone($this->zone())
            : CarbonImmutable::instance($resolved)->setTimezone($this->zone());
    }
}
