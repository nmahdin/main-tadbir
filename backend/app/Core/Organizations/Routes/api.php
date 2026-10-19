<?php

use App\Http\Controllers\Api\V1\Core\EnvironmentController;
use App\Http\Controllers\Api\V1\Core\OrganizationController;
use App\Http\Controllers\Api\V1\Core\WorkspaceController;
use Illuminate\Support\Facades\Route;

/*
| Organizations/Workspaces domain — authenticated routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// UX-02-1 — read-only environment discovery (additive; K1 decision).
Route::get('core/environments', [EnvironmentController::class, 'index'])->name('api.v1.core.environments.index');

// Stage 03A — Core organization/workspace foundation (additive).
Route::get('core/organizations', [OrganizationController::class, 'index'])->name('api.v1.core.organizations.index');
Route::post('core/organizations', [OrganizationController::class, 'store'])->name('api.v1.core.organizations.store');
Route::get('core/organizations/{organization}', [OrganizationController::class, 'show'])->name('api.v1.core.organizations.show');
Route::get('core/workspaces', [WorkspaceController::class, 'index'])->name('api.v1.core.workspaces.index');
Route::post('core/workspaces', [WorkspaceController::class, 'store'])->name('api.v1.core.workspaces.store');
Route::get('core/workspaces/{workspace}', [WorkspaceController::class, 'show'])->name('api.v1.core.workspaces.show');
