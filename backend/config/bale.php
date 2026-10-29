<?php

return [
    // A separate random secret for the HTTPS runner, never the Bale token. Empty disables only the external route; host scheduler may still run.
    'runner_secret' => env('BALE_RUNNER_SECRET'),
    // Public backend base URL (including a deployment subdirectory), not the SPA URL.
    // Empty falls back to app.url. Never derive a public callback from the request Host.
    'webhook_base_url' => env('BALE_PUBLIC_BASE_URL'),
    'panel_url' => env('BALE_PANEL_URL') ?: 'https://tadbir.morvarid-daron.ir/',
    'code_lifetime_minutes' => 5,
    // جریانِ ناتمام (ثبت ردیف جدول، دریافت متن یا فایل) با هر تعامل تمدید می‌شود؛
    // عددِ کوتاه باعث می‌شد کاربر وسطِ فرم به منوی اصلی برگردد.
    'session_lifetime_minutes' => (int) env('BALE_SESSION_LIFETIME_MINUTES', 60),
    'request_timeout' => 4,
    'tick_seconds' => 15,
];
