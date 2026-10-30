<?php

namespace App\Bot\Bale\Support;

use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;

final class RuntimeLock
{
    /**
     * اجرای عملیات زیر قفلِ مشترکِ بات.
     *
     * پیش‌تر اگر پولینگِ بات همان لحظه قفل را داشت، ذخیرهٔ تنظیمات/خودکارسازی
     * فوراً با ۴۰۹ برمی‌گشت و پنل آن را با «نسخهٔ قدیمی» اشتباه می‌گرفت؛ حالا
     * تا چند ثانیه صبر می‌کنیم و فقط در صورت طولانی‌شدن، خطای روشن می‌دهیم.
     */
    public function run(Closure $callback): mixed
    {
        $lock = Cache::lock('bale:runtime', 90);
        try {
            $lock->block(5);
        } catch (LockTimeoutException) {
            abort(409, 'یک عملیات بله در حال اجراست؛ چند لحظه بعد دوباره تلاش کنید.');
        }
        try {
            return $callback();
        } finally {
            $lock->release();
        }
    }
}
