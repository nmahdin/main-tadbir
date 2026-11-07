<?php

/*
|--------------------------------------------------------------------------
| Invitation & Email Verification Links (Stage C6-3)
|--------------------------------------------------------------------------
|
| Public base URL of the web application that serves the
| token-bearing pages. Links placed in email messages are built
| from this base plus the page paths below. The React pages
| themselves are Stage C6-4; these paths are the integration
| contract it must serve:
|
|   {frontend_base_url}{verification_path}?token=...&email=...
|   {frontend_base_url}{invitation_path}?token=...
|
| Token-bearing pages must render with no-store caching and a
| no-referrer policy, and the token must never be forwarded to
| analytics, logs, or third-party requests.
|
*/

return [
    'frontend_base_url' => env('TADBIR_FRONTEND_URL', env('APP_URL', 'http://localhost')),
    'verification_path' => env('TADBIR_EMAIL_VERIFICATION_PATH', '/verify-email'),
    'invitation_path' => env('TADBIR_INVITATION_PATH', '/invitations/accept'),
];
