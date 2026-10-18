<?php

use App\Http\Controllers\Api\V1\Core\InvitationPreviewController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

/*
| Invitations domain — public routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// Stage C6-3 — public read-only invitation preview. The token
// travels in the POST body (never a logged URL); preview never
// consumes or mutates the invitation. Rate-limited and answered
// with no-store/no-referrer headers by the controller.
Route::post('invitations/preview', InvitationPreviewController::class)
    ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
    ->middleware('throttle:20,1,invitation-preview')
    ->name('api.v1.invitations.preview');
