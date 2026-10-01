<?php

use App\Http\Controllers\StatusPageController;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

// صفحهٔ مستقل وضعیت بک‌اند روی ریشهٔ دامنهٔ API (بدون وابستگی به فرانت‌اند).
// عمداً بدون stack نشست/کوکی/CSRF تا هر بازدید فایل یا ردیف نشست نسازد.
// وضعیت زنده را مرورگر از `/api/v1/health` و `/api/v1/health/db` می‌خواند؛
// پایش خودکار سرویس همچنان باید از endpoint سبک `/up` انجام شود.
Route::get('/', StatusPageController::class)
    ->withoutMiddleware([
        EncryptCookies::class,
        AddQueuedCookiesToResponse::class,
        StartSession::class,
        ShareErrorsFromSession::class,
        PreventRequestForgery::class,
    ])
    ->name('status');
