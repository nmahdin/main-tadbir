<?php

return [
    // A separate random secret for the HTTPS runner, never the Bale token. Empty disables only the external route; host scheduler may still run.
    'runner_secret' => env('BALE_RUNNER_SECRET'),
    // Public backend base URL (including a deployment subdirectory), not the SPA URL.
    // Empty falls back to app.url. Never derive a public callback from the request Host.
    'webhook_base_url' => env('BALE_PUBLIC_BASE_URL'),
    'panel_url' => env('BALE_PANEL_URL') ?: 'https://tadbir.morvarid-daron.ir/',
    'code_lifetime_minutes' => 5,
    'session_lifetime_minutes' => 15,
    'request_timeout' => 4,
    'tick_seconds' => 15,
];
