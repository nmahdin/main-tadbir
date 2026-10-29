<?php

use App\Http\Controllers\Api\V1\Platform\PlatformAssignmentController;
use App\Http\Controllers\Api\V1\Platform\PlatformAuditController;
use App\Http\Controllers\Api\V1\Platform\PlatformOrganizationController;
use App\Http\Controllers\Api\V1\Platform\PlatformRoleController;
use App\Http\Controllers\Api\V1\Platform\PlatformSubscriptionController;
use App\Http\Controllers\Api\V1\Platform\PlatformUserController;
use Illuminate\Support\Facades\Route;

/*
| Platform domain — platform-administration routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// Stage C2-3 — Platform Administration API. Authorization is
// platform-scope only (PlatformAuthorizer per endpoint); the
// legacy permission middleware intentionally does not apply.
Route::prefix('platform')->name('api.v1.platform.')->group(function (): void {
    Route::get('roles', [PlatformRoleController::class, 'index'])->name('roles.index');
    Route::post('roles', [PlatformRoleController::class, 'store'])->name('roles.store');
    Route::get('roles/{role}', [PlatformRoleController::class, 'show'])->name('roles.show');
    Route::put('roles/{role}', [PlatformRoleController::class, 'update'])->name('roles.update');
    Route::delete('roles/{role}', [PlatformRoleController::class, 'destroy'])->name('roles.destroy');
    Route::get('assignments', [PlatformAssignmentController::class, 'index'])->name('assignments.index');
    Route::post('assignments', [PlatformAssignmentController::class, 'store'])->name('assignments.store');
    Route::post('assignments/{assignment}/revoke', [PlatformAssignmentController::class, 'revoke'])->name('assignments.revoke');
    Route::post('assignments/{assignment}/replace', [PlatformAssignmentController::class, 'replace'])->name('assignments.replace');
    Route::get('users', [PlatformUserController::class, 'index'])->name('users.index');
    Route::get('organizations', [PlatformOrganizationController::class, 'index'])->name('organizations.index');
    Route::get('organizations/{organization}', [PlatformOrganizationController::class, 'show'])->name('organizations.show');
    Route::post('organizations/{organization}/suspend', [PlatformOrganizationController::class, 'suspend'])->name('organizations.suspend');
    Route::post('organizations/{organization}/reactivate', [PlatformOrganizationController::class, 'reactivate'])->name('organizations.reactivate');
    Route::post('organizations/{organization}/end', [PlatformOrganizationController::class, 'end'])->name('organizations.end');
    Route::post('organizations/{organization}/restore', [PlatformOrganizationController::class, 'restore'])->name('organizations.restore');
    Route::get('audit-logs', [PlatformAuditController::class, 'index'])->name('audit-logs.index');
    // Stage C5-4 — subscription administration (platform.subscriptions.manage).
    Route::get('organizations/{organization}/subscription', [PlatformSubscriptionController::class, 'showOrganization'])->name('organizations.subscription.show');
    Route::post('organizations/{organization}/subscription', [PlatformSubscriptionController::class, 'assignOrganization'])->name('organizations.subscription.assign');
    Route::get('workspaces/{workspace}/subscription', [PlatformSubscriptionController::class, 'showWorkspace'])->name('workspaces.subscription.show');
    Route::post('workspaces/{workspace}/subscription', [PlatformSubscriptionController::class, 'assignWorkspace'])->name('workspaces.subscription.assign');
    Route::post('subscriptions/{subscription}/renew', [PlatformSubscriptionController::class, 'renew'])->name('subscriptions.renew');
    Route::post('subscriptions/{subscription}/plan-change-preview', [PlatformSubscriptionController::class, 'previewPlanChange'])->name('subscriptions.plan-change-preview');
    Route::post('subscriptions/{subscription}/plan-change', [PlatformSubscriptionController::class, 'planChange'])->name('subscriptions.plan-change');
    Route::get('subscriptions/{subscription}/history', [PlatformSubscriptionController::class, 'history'])->name('subscriptions.history');
});
