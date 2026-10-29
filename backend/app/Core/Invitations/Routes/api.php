<?php

use App\Http\Controllers\Api\V1\Core\InvitationAcceptanceController;
use App\Http\Controllers\Api\V1\Core\InvitationController;
use Illuminate\Support\Facades\Route;

/*
| Invitations domain — authenticated routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// Stage C6-3 — invitation administration over the C6-1
// service (authorization + ceilings enforced in-service;
// list/revoke responses never contain token material).
Route::get('core/organizations/{organization}/invitations', [InvitationController::class, 'indexForOrganization'])->name('api.v1.core.organizations.invitations.index');
Route::post('core/organizations/{organization}/invitations', [InvitationController::class, 'storeForOrganization'])->name('api.v1.core.organizations.invitations.store');
Route::get('core/workspaces/{workspace}/invitations', [InvitationController::class, 'indexForWorkspace'])->name('api.v1.core.workspaces.invitations.index');
Route::post('core/workspaces/{workspace}/invitations', [InvitationController::class, 'storeForWorkspace'])->name('api.v1.core.workspaces.invitations.store');
Route::post('core/workspaces/{workspace}/combined-invitations', [InvitationController::class, 'storeCombined'])->name('api.v1.core.workspaces.invitations.combined');
Route::post('core/invitations/{invitation}/revoke', [InvitationController::class, 'revoke'])->name('api.v1.core.invitations.revoke');

// Stage C6-3 — authenticated acceptance (token-only body;
// actor/scope always from auth + persisted invitation).
Route::post('invitations/accept', InvitationAcceptanceController::class)
    ->middleware('throttle:10,1,invitation-accept')
    ->name('api.v1.invitations.accept');
