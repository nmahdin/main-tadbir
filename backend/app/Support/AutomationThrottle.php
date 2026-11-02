<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * محدودکنندهٔ کارهای خودکارِ مسیرِ خواندن.
 *
 * چند سرویس (تازه‌سازی وضعیت «تأخیر»، فعال‌سازی رخدادهای مجموعه و یادآوری
 * انتشار) عمداً بدون cron و در خودِ درخواست اجرا می‌شوند تا سامانه روی یک
 * سرور ساده هم کار کند. اما اجرای آن‌ها در «هر» درخواست، هزینهٔ پنهانی دارد:
 * هر بار یک پویش با فیلتر روی ستون JSON و چند نوشتن احتمالی. با این کلاس،
 * هر کار در هر بازهٔ زمانی حداکثر یک بار اجرا می‌شود و بقیهٔ درخواست‌ها از
 * نتیجهٔ همان اجرا استفاده می‌کنند.
 *
 * اگر کش در دسترس نباشد، کار اجرا می‌شود؛ درست‌بودن داده مهم‌تر از صرفه‌جویی
 * است و سامانه هرگز به‌خاطر کش از کار نمی‌افتد.
 */
final class AutomationThrottle
{
    /**
     * @param  callable():mixed  $work
     * @return mixed نتیجهٔ اجرا یا null اگر در این بازه قبلاً اجرا شده باشد
     */
    public static function once(string $key, int $seconds, callable $work): mixed
    {
        $cacheKey = 'automation:'.$key;

        try {
            $fresh = Cache::add($cacheKey, 1, max(1, $seconds));
        } catch (Throwable) {
            $fresh = true;
        }

        if (! $fresh) {
            return null;
        }

        try {
            return $work();
        } catch (Throwable $error) {
            // اجرای ناموفق نباید کل بازه را «انجام‌شده» جا بزند.
            try {
                Cache::forget($cacheKey);
            } catch (Throwable) {
                // بی‌اهمیت: در بدترین حالت اجرای بعدی یک بازه صبر می‌کند.
            }

            throw $error;
        }
    }
}
