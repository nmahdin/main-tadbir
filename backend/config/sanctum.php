<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Sanctum;

/*
| The browser panel is a first-party SPA even though it is hosted on another
| subdomain. Keep its host in Sanctum's stateful list independently of a
| possibly incomplete SANCTUM_STATEFUL_DOMAINS value on shared hosting.
*/
$frontendUrl = rtrim((string) env('FRONTEND_URL', 'https://tadbir.morvarid-daron.ir'), '/');
$frontendHost = parse_url($frontendUrl, PHP_URL_HOST);
$frontendPort = parse_url($frontendUrl, PHP_URL_PORT);
$frontendDomain = is_string($frontendHost) && $frontendHost !== ''
    ? $frontendHost.($frontendPort ? ':'.$frontendPort : '')
    : null;

$configuredStatefulDomains = array_map(
    static fn (string $domain): string => trim($domain),
    explode(',', (string) env('SANCTUM_STATEFUL_DOMAINS', '')),
);

$statefulDomains = array_values(array_unique(array_filter([
    'localhost',
    'localhost:3000',
    'localhost:5173',
    'localhost:8000',
    '127.0.0.1',
    '127.0.0.1:3000',
    '127.0.0.1:5173',
    '127.0.0.1:8000',
    '::1',
    ...$configuredStatefulDomains,
    $frontendDomain,
    ltrim(Sanctum::currentApplicationUrlWithPort(), ','),
    Sanctum::$currentRequestHostPlaceholder,
])));

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following domains / hosts will receive stateful API
    | authentication cookies. Typically, these should include your local
    | and production domains which access your API via a frontend SPA.
    |
    */

    'stateful' => $statefulDomains,

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued token will be
    | considered expired. This will override any values set in the token's
    | "expires_at" attribute, but first-party sessions are not affected.
    |
    */

    'expiration' => null,

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
