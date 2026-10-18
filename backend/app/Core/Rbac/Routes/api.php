<?php

use App\Http\Controllers\Api\V1\Core\OrganizationRoleController;
use App\Http\Controllers\Api\V1\Core\WorkspaceRoleController;
use Illuminate\Support\Facades\Route;

/*
| Rbac domain — authenticated scoped-role routes (ARCH-01). Loaded by the thin registrar in
| routes/api.php at the original registration position; the
| statements below are verbatim — paths, names, middleware
| and throttles are unchanged.
*/

    // Stage 03B — scoped RBAC administration (additive).
    Route::get('core/organizations/{organization}/roles', [OrganizationRoleController::class, 'index'])->name('api.v1.core.organizations.roles.index');
    Route::put('core/organizations/{organization}/memberships/{membership}/role', [OrganizationRoleController::class, 'assign'])->name('api.v1.core.organizations.memberships.role');
    Route::get('core/workspaces/{workspace}/roles', [WorkspaceRoleController::class, 'index'])->name('api.v1.core.workspaces.roles.index');
    Route::post('core/workspaces/{workspace}/roles', [WorkspaceRoleController::class, 'store'])->name('api.v1.core.workspaces.roles.store');
    Route::patch('core/workspaces/{workspace}/roles/{role}', [WorkspaceRoleController::class, 'update'])->name('api.v1.core.workspaces.roles.update');
    Route::delete('core/workspaces/{workspace}/roles/{role}', [WorkspaceRoleController::class, 'destroy'])->name('api.v1.core.workspaces.roles.destroy');
    Route::put('core/workspaces/{workspace}/memberships/{membership}/role', [WorkspaceRoleController::class, 'assign'])->name('api.v1.core.workspaces.memberships.role');
