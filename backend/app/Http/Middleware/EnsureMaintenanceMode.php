<?php

namespace App\Http\Middleware;

use App\Support\Maintenance\MaintenanceMode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * دروازهٔ «حالت تعمیر» برای همهٔ مسیرهای احراز‌شده.
 *
 * پیش از این میان‌افزار، `EnsureActiveAccount` وضعیت حساب را بررسی می‌کند؛ اینجا
 * فقط یک پرسش باقی می‌ماند: آیا کاربر اجازهٔ استفاده از سامانه در حالت تعمیر را
 * دارد؟ پاسخ برای نقش «مدیریت کل سیستم» (`admin`) همیشه بله است و برای بقیه —
 * حتی نشست‌های قدیمی — خیر. خروج از حساب استثناست تا کاربر بتواند نشستِ خود را
 * ببندد و صفحهٔ ورود قفل نشود.
 */
final class EnsureMaintenanceMode
{
    public function __construct(private readonly MaintenanceMode $mode) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->mode->enabled()) {
            return $next($request);
        }

        // خروج از حساب همیشه ممکن باشد؛ در غیر این صورت کاربرِ مسدود نمی‌تواند
        // نشستش را ببندد و صفحهٔ تعمیر تا ابد با یک نشست باز می‌ماند.
        if ($request->routeIs('api.v1.auth.logout')) {
            return $next($request);
        }

        // `me` برای کاربر مسدود، پاسخ ۵۰۳ با کد `maintenance_mode` می‌دهد تا رابط
        // کاربری به‌جای «خطای عمومی» صفحهٔ تعمیر را نشان دهد.
        if ($request->user()?->isAdmin()) {
            return $next($request);
        }

        return $this->mode->response();
    }
}
