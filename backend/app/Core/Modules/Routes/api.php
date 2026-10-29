<?php

use App\Http\Controllers\Api\V1\Core\WorkspaceModuleController;
use Illuminate\Support\Facades\Route;

/*
| Modules domain — authenticated workspace-module routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

// Stage C4-3 — workspace module management (thin layer over C4-2 services).
Route::get('core/workspaces/{workspace}/modules', [WorkspaceModuleController::class, 'index'])->name('api.v1.core.workspaces.modules.index');
Route::post('core/workspaces/{workspace}/modules/{module}/activation-preview', [WorkspaceModuleController::class, 'preview'])->name('api.v1.core.workspaces.modules.preview');
Route::post('core/workspaces/{workspace}/modules/{module}/activate', [WorkspaceModuleController::class, 'activate'])->name('api.v1.core.workspaces.modules.activate');
Route::post('core/workspaces/{workspace}/modules/{module}/deactivate', [WorkspaceModuleController::class, 'deactivate'])->name('api.v1.core.workspaces.modules.deactivate');
