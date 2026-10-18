<?php

use App\Http\Controllers\Api\V1\Core\EmailVerificationController;
use Illuminate\Support\Facades\Route;

/*
| Identity domain — authenticated verified-email routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// Stage C6-3 — verified-email self-service (C6-2 service).
Route::get('auth/email/verification', [EmailVerificationController::class, 'show'])->name('api.v1.auth.email.verification.show');
Route::post('auth/email/verification/request', [EmailVerificationController::class, 'request'])
    ->middleware('throttle:5,1,email-verification-request')
    ->name('api.v1.auth.email.verification.request');
Route::post('auth/email/verification/confirm', [EmailVerificationController::class, 'confirm'])
    ->middleware('throttle:10,1,email-verification-confirm')
    ->name('api.v1.auth.email.verification.confirm');
