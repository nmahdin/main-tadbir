<?php

$frontendUrl = rtrim((string) env('FRONTEND_URL', 'https://tadbir.morvarid-daron.ir'), '/');

return [
    'paths' => [
        'api/*',
        'sanctum/csrf-cookie',
    ],

    'allowed_methods' => ['*'],

    'allowed_origins' => [$frontendUrl],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
