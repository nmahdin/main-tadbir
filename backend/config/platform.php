<?php

return [
    /*
     * Platform bootstrap & emergency-recovery operations (Stage
     * C2-4). These operations never run over HTTP: they execute
     * through Artisan (cron one-shot or controlled VPS shell) using
     * single-use, HMAC-signed operation tokens.
     *
     * `secret` is the shared HMAC key held by the infrastructure
     * operator. It must be provisioned through the environment,
     * never committed. Without it every operation fails closed.
     *
     * `directory` is where pending `*.opreq` token files may be
     * placed for `platform:operations:process`. It must live
     * outside any publicly served directory (the default is inside
     * storage/app, which Laravel never serves).
     */
    'operations' => [
        'secret' => env('PLATFORM_OPERATIONS_SECRET'),
        'directory' => env('PLATFORM_OPERATIONS_DIR', storage_path('app/platform-operations')),
        'max_ttl_seconds' => (int) env('PLATFORM_OPERATIONS_MAX_TTL', 3600),
    ],
];
