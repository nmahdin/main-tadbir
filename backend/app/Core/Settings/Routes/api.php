<?php

use App\Http\Controllers\Api\V1\Core\ScopedSettingsController;
use App\Http\Controllers\Api\V1\Core\ScopedSettingsHistoryController;
use App\Http\Controllers\Api\V1\Core\ScopedSettingsSecretsController;
use Illuminate\Support\Facades\Route;

/*
| Scoped Settings domain — authenticated routes (Stage C7-4).
| Loaded by the thin registrar in routes/api.php through
| DomainPaths::routeFiles()['authenticated'].
|
| Scope is always the route-bound persisted Organization/Workspace
| (or the authenticated actor for preferences); authorization is
| enforced inside the C7-2/C7-3 services from persisted
| memberships. There is deliberately no generic owner-type /
| owner-id endpoint and no secret reveal/read endpoint.
*/

// Organization settings, override policies, history, secrets.
Route::get('core/organizations/{organization}/settings', [ScopedSettingsController::class, 'organizationIndex'])->name('api.v1.core.organizations.settings.index');
Route::put('core/organizations/{organization}/settings/{key}', [ScopedSettingsController::class, 'organizationWrite'])->name('api.v1.core.organizations.settings.write');
Route::delete('core/organizations/{organization}/settings/{key}', [ScopedSettingsController::class, 'organizationRemove'])->name('api.v1.core.organizations.settings.remove');
Route::put('core/organizations/{organization}/settings/{key}/policy', [ScopedSettingsController::class, 'organizationPolicy'])->name('api.v1.core.organizations.settings.policy');
Route::get('core/organizations/{organization}/settings/{key}/history', [ScopedSettingsHistoryController::class, 'organizationHistory'])->name('api.v1.core.organizations.settings.history');
Route::post('core/organizations/{organization}/settings/{key}/history/{revision}/restore', [ScopedSettingsHistoryController::class, 'organizationRestore'])->name('api.v1.core.organizations.settings.restore');
Route::get('core/organizations/{organization}/secrets', [ScopedSettingsSecretsController::class, 'organizationIndex'])->name('api.v1.core.organizations.secrets.index');
Route::put('core/organizations/{organization}/secrets/{key}', [ScopedSettingsSecretsController::class, 'organizationPut'])->name('api.v1.core.organizations.secrets.put');
Route::delete('core/organizations/{organization}/secrets/{key}', [ScopedSettingsSecretsController::class, 'organizationRevoke'])->name('api.v1.core.organizations.secrets.revoke');

// Workspace settings (inheritance + override policy enforced in-service).
Route::get('core/workspaces/{workspace}/settings', [ScopedSettingsController::class, 'workspaceIndex'])->name('api.v1.core.workspaces.settings.index');
Route::put('core/workspaces/{workspace}/settings/{key}', [ScopedSettingsController::class, 'workspaceWrite'])->name('api.v1.core.workspaces.settings.write');
Route::delete('core/workspaces/{workspace}/settings/{key}', [ScopedSettingsController::class, 'workspaceRemove'])->name('api.v1.core.workspaces.settings.remove');
Route::get('core/workspaces/{workspace}/settings/{key}/history', [ScopedSettingsHistoryController::class, 'workspaceHistory'])->name('api.v1.core.workspaces.settings.history');
Route::post('core/workspaces/{workspace}/settings/{key}/history/{revision}/restore', [ScopedSettingsHistoryController::class, 'workspaceRestore'])->name('api.v1.core.workspaces.settings.restore');
Route::get('core/workspaces/{workspace}/secrets', [ScopedSettingsSecretsController::class, 'workspaceIndex'])->name('api.v1.core.workspaces.secrets.index');
Route::put('core/workspaces/{workspace}/secrets/{key}', [ScopedSettingsSecretsController::class, 'workspacePut'])->name('api.v1.core.workspaces.secrets.put');
Route::delete('core/workspaces/{workspace}/secrets/{key}', [ScopedSettingsSecretsController::class, 'workspaceRevoke'])->name('api.v1.core.workspaces.secrets.revoke');

// Personal display preferences — always the authenticated actor's own.
Route::get('core/preferences', [ScopedSettingsController::class, 'preferenceIndex'])->name('api.v1.core.preferences.index');
Route::put('core/preferences/{key}', [ScopedSettingsController::class, 'preferenceWrite'])->name('api.v1.core.preferences.write');
Route::delete('core/preferences/{key}', [ScopedSettingsController::class, 'preferenceRemove'])->name('api.v1.core.preferences.remove');
Route::get('core/preferences/{key}/history', [ScopedSettingsHistoryController::class, 'preferenceHistory'])->name('api.v1.core.preferences.history');
Route::post('core/preferences/{key}/history/{revision}/restore', [ScopedSettingsHistoryController::class, 'preferenceRestore'])->name('api.v1.core.preferences.restore');
