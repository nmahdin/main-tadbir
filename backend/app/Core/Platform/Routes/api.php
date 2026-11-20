<?php

use App\Http\Controllers\Api\V1\Platform\PlatformAssignmentController;
use App\Http\Controllers\Api\V1\Platform\PlatformAuditController;
use App\Http\Controllers\Api\V1\Platform\PlatformBackupController;
use App\Http\Controllers\Api\V1\Platform\PlatformBillingFinanceController;
use App\Http\Controllers\Api\V1\Platform\PlatformBillingPriceController;
use App\Http\Controllers\Api\V1\Platform\PlatformHealthController;
use App\Http\Controllers\Api\V1\Platform\PlatformIncidentController;
use App\Http\Controllers\Api\V1\Platform\PlatformMaintenanceController;
use App\Http\Controllers\Api\V1\Platform\PlatformMessageController;
use App\Http\Controllers\Api\V1\Platform\PlatformOrganizationController;
use App\Http\Controllers\Api\V1\Platform\PlatformPromotionController;
use App\Http\Controllers\Api\V1\Platform\PlatformRestoreController;
use App\Http\Controllers\Api\V1\Platform\PlatformRoleController;
use App\Http\Controllers\Api\V1\Platform\PlatformSecurityEventController;
use App\Http\Controllers\Api\V1\Platform\PlatformSubscriptionController;
use App\Http\Controllers\Api\V1\Platform\PlatformSupportController;
use App\Http\Controllers\Api\V1\Platform\PlatformTaxRuleController;
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
    // Stage C5-M2-S1 — commercial price administration (platform.billing.manage).
    Route::get('billing/plans', [PlatformBillingPriceController::class, 'indexPlans'])->name('billing.plans.index');
    Route::get('billing/plans/{planKey}/prices', [PlatformBillingPriceController::class, 'showPlanPrices'])->name('billing.prices.show-plan');
    Route::post('billing/plan-versions/{version}/publish-prices', [PlatformBillingPriceController::class, 'publish'])->name('billing.prices.publish');
    // Stage C5-M2-S2 — tax rule and promotion administration (platform.billing.manage).
    Route::get('billing/tax-rules', [PlatformTaxRuleController::class, 'index'])->name('billing.taxes.index');
    Route::get('billing/tax-rules/active', [PlatformTaxRuleController::class, 'active'])->name('billing.taxes.active');
    Route::post('billing/tax-rules', [PlatformTaxRuleController::class, 'store'])->name('billing.taxes.store');
    Route::post('billing/tax-rules/{rule}/activate', [PlatformTaxRuleController::class, 'activate'])->name('billing.taxes.activate');
    Route::post('billing/tax-rules/{rule}/deactivate', [PlatformTaxRuleController::class, 'deactivate'])->name('billing.taxes.deactivate');
    Route::get('billing/promotions', [PlatformPromotionController::class, 'index'])->name('billing.promos.index');
    Route::post('billing/promotions', [PlatformPromotionController::class, 'store'])->name('billing.promos.store');
    Route::post('billing/promotions/{promotion}/deactivate', [PlatformPromotionController::class, 'deactivate'])->name('billing.promos.deactivate');
    // C5-M5/M6 — financial document inspection & reconciliation (platform.billing.manage).
    Route::get('billing/findings', [PlatformBillingFinanceController::class, 'findings'])->name('billing.findings.index');
    Route::get('billing/findings/{finding}', [PlatformBillingFinanceController::class, 'showFinding'])->name('billing.findings.show')->whereNumber('finding');
    Route::post('billing/findings/{finding}/resolve', [PlatformBillingFinanceController::class, 'resolve'])->name('billing.findings.resolve')->whereNumber('finding');
    Route::post('billing/reconcile', [PlatformBillingFinanceController::class, 'sweep'])->name('billing.reconcile.run');
    // Stage C6-CORE — official messages (platform.messages.manage).
    Route::get('messages', [PlatformMessageController::class, 'index'])->name('messages.index');
    Route::post('messages', [PlatformMessageController::class, 'store'])->name('messages.store');
    Route::post('messages/{systemMessage}/publish', [PlatformMessageController::class, 'publish'])->name('messages.publish');
    Route::post('messages/{systemMessage}/retire', [PlatformMessageController::class, 'retire'])->name('messages.retire');
    Route::get('messages/{systemMessage}/deliveries', [PlatformMessageController::class, 'deliveries'])->name('messages.deliveries');
    // Stage C6-CORE — platform support queue (platform.support.agent / manage).
    Route::get('support/queue', [PlatformSupportController::class, 'queue'])->name('support.queue');
    Route::post('support/tickets/{supportTicket}/status', [PlatformSupportController::class, 'transition'])->name('support.tickets.status');
    Route::post('support/tickets/{supportTicket}/assign', [PlatformSupportController::class, 'assign'])->name('support.tickets.assign');

    // Stage C7-CORE — security & operations.
    Route::get('health', [PlatformHealthController::class, 'details'])->name('health.details');
    Route::get('security/events', [PlatformSecurityEventController::class, 'index'])->name('security.events.index');
    Route::get('incidents', [PlatformIncidentController::class, 'incidents'])->name('incidents.index');
    Route::post('incidents', [PlatformIncidentController::class, 'openIncident'])->name('incidents.open');
    Route::get('incidents/{incident}', [PlatformIncidentController::class, 'showIncident'])->name('incidents.show');
    Route::post('incidents/{incident}/transition', [PlatformIncidentController::class, 'transition'])->name('incidents.transition');
    Route::post('incidents/{incident}/assign', [PlatformIncidentController::class, 'assign'])->name('incidents.assign');
    Route::get('alerts', [PlatformIncidentController::class, 'alerts'])->name('alerts.index');
    Route::post('alerts/{alert}/acknowledge', [PlatformIncidentController::class, 'acknowledgeAlert'])->name('alerts.acknowledge');
    Route::post('alerts/{alert}/resolve', [PlatformIncidentController::class, 'resolveAlert'])->name('alerts.resolve');
    Route::get('maintenance', [PlatformMaintenanceController::class, 'index'])->name('maintenance.index');
    Route::get('maintenance/current', [PlatformMaintenanceController::class, 'current'])->name('maintenance.current');
    Route::post('maintenance', [PlatformMaintenanceController::class, 'schedule'])->name('maintenance.schedule');
    Route::post('maintenance/{window}/activate', [PlatformMaintenanceController::class, 'activate'])->middleware('step-up:maintenance.manage')->name('maintenance.activate');
    Route::post('maintenance/{window}/complete', [PlatformMaintenanceController::class, 'complete'])->name('maintenance.complete');
    Route::post('maintenance/{window}/cancel', [PlatformMaintenanceController::class, 'cancel'])->name('maintenance.cancel');
    Route::get('backups', [PlatformBackupController::class, 'index'])->name('backups.index');
    Route::get('backups/{backupJob}', [PlatformBackupController::class, 'show'])->name('backups.show');
    Route::post('backups', [PlatformBackupController::class, 'request'])->name('backups.request');
    Route::post('backups/{backupJob}/execute', [PlatformBackupController::class, 'execute'])->name('backups.execute');
    Route::get('restores', [PlatformRestoreController::class, 'index'])->name('restores.index');
    Route::post('backups/{backupJob}/restore', [PlatformRestoreController::class, 'request'])->middleware('step-up:backup.restore')->name('restores.request');
    Route::post('restores/{verification}/preflight', [PlatformRestoreController::class, 'preflight'])->name('restores.preflight');
    Route::post('restores/{verification}/verify', [PlatformRestoreController::class, 'verify'])->middleware('step-up:backup.restore')->name('restores.verify');
});
