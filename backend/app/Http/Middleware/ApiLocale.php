<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * زبان پیام‌های API را روی فارسی می‌گذارد.
 *
 * رابط کاربری سامانه فارسی است و پیام‌های اعتبارسنجی هم از
 * `lang/fa/validation.php` می‌آیند. اما اگر میزبان در `.env` مقدار
 * `APP_LOCALE=en` داشته باشد (یا اصلاً نداشته باشد و پیش‌فرض قدیمی `en` باشد)،
 * Laravel پیام انگلیسی برمی‌گرداند؛ فرانت‌اند فقط متن فارسی را نمایش می‌دهد و
 * کاربر فقط «اطلاعات واردشده معتبر نیست» می‌دید، بدون دلیل. این میان‌افزار زبان
 * پاسخ‌های API را مستقل از تنظیم میزبان فارسی می‌کند.
 *
 * عمداً به `Accept-Language` گوش نمی‌دهد: مرورگرهای فارسی‌زبان معمولاً
 * `en-US,en;q=0.9` می‌فرستند و پذیرش آن دقیقاً همان مشکل انگلیسی‌شدن پیام‌ها را
 * برمی‌گرداند. تغییر زبان فقط با هدر صریح `X-Locale` ممکن است.
 */
class ApiLocale
{
    /** زبان‌هایی که ترجمهٔ سامانه برایشان وجود دارد (یا انگلیسیِ چارچوب). */
    private const SUPPORTED = ['fa', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is('api/*')) {
            app()->setLocale($this->requested($request) ?? 'fa');
        }

        return $next($request);
    }

    /** زبان درخواستی کاربر از هدرها؛ فقط اگر پشتیبانی شود. */
    private function requested(Request $request): ?string
    {
        $explicit = strtolower(substr(trim((string) $request->header('X-Locale', '')), 0, 5));

        return in_array($explicit, self::SUPPORTED, true) ? $explicit : null;
    }
}
