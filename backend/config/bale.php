<?php

return [
    // A separate random secret, never the Bale token. Empty disables external processing.
    'runner_secret' => env('BALE_RUNNER_SECRET'),
    // Public backend base URL (including a deployment subdirectory), not the SPA URL.
    // Empty falls back to app.url. Never derive a public callback from the request Host.
    'webhook_base_url' => env('BALE_PUBLIC_BASE_URL'),
    'panel_url' => env('BALE_PANEL_URL', env('APP_URL')),
    'code_lifetime_minutes' => 5,
    'session_lifetime_minutes' => 15,
    'request_timeout' => 4,
    'tick_seconds' => 15,
];
