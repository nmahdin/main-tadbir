<?php

return [
    // A separate random secret, never the Bale token. Empty disables external processing.
    'runner_secret' => env('BALE_RUNNER_SECRET'),
    'panel_url' => env('BALE_PANEL_URL', env('APP_URL')),
    'code_lifetime_minutes' => 5,
    'session_lifetime_minutes' => 15,
    'request_timeout' => 4,
    'tick_seconds' => 15,
];
