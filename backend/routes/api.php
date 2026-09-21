<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WorkspaceRecordController;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API نسخه ۱ سامانه تدبیر
|--------------------------------------------------------------------------
|
| همه مسیرها با پیشوند /api/v1 در دسترس هستند. احراز هویت به‌صورت ترکیبی
| کار می‌کند: نشست (کوکی) برای SPA و توکن برای کلاینت‌های موبایل.
|
*/

Route::prefix('v1')->group(function (): void {
    Route::post('auth/login', [AuthController::class, 'login'])->name('api.v1.auth.login');
    Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword'])->name('api.v1.auth.forgot-password');
    Route::post('auth/reset-password', [AuthController::class, 'resetPassword'])->name('api.v1.auth.reset-password');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me'])->name('api.v1.auth.me');
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('api.v1.auth.logout');

        Route::get('projects', [ProjectController::class, 'index'])->middleware('permission:projects.view');
        Route::post('projects', [ProjectController::class, 'store'])->middleware('permission:projects.create');
        Route::get('projects/{project}', [ProjectController::class, 'show'])->middleware('permission:projects.view');
        Route::match(['put', 'patch'], 'projects/{project}', [ProjectController::class, 'update'])->middleware('permission:projects.edit');
        Route::delete('projects/{project}', [ProjectController::class, 'destroy'])->middleware('permission:projects.delete');
        Route::get('contents', [ContentController::class, 'index'])->middleware('permission:content.view');
        Route::post('contents', [ContentController::class, 'store'])->middleware('permission:content.create');
        Route::get('contents/{content}', [ContentController::class, 'show'])->middleware('permission:content.view');
        Route::match(['put', 'patch'], 'contents/{content}', [ContentController::class, 'update'])->middleware('permission:content.edit');
        Route::delete('contents/{content}', [ContentController::class, 'destroy'])->middleware('permission:content.delete');
        Route::apiResource('tasks', TaskController::class);
        Route::get('users/directory', [UserController::class, 'directory'])->name('api.v1.users.directory');
        Route::get('users', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.create');
        Route::match(['put', 'patch'], 'users/{user}', [UserController::class, 'update']);
        Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
        Route::patch('tasks/{task}/status', [TaskController::class, 'updateStatus'])
            ->name('api.v1.tasks.status');

        foreach ([
            'ideas' => WorkspaceRecord::KIND_IDEA,
            'think-tank-meetings' => WorkspaceRecord::KIND_MEETING,
            'secretariat-letters' => WorkspaceRecord::KIND_LETTER,
            'secretariat-resolutions' => WorkspaceRecord::KIND_RESOLUTION,
            'archive-dossiers' => WorkspaceRecord::KIND_DOSSIER,
        ] as $prefix => $kind) {
            Route::prefix($prefix)->group(function () use ($prefix, $kind): void {
                Route::get('/', [WorkspaceRecordController::class, 'index'])->defaults('kind', $kind)->name("api.v1.{$prefix}.index");
                Route::post('/', [WorkspaceRecordController::class, 'store'])->defaults('kind', $kind)->name("api.v1.{$prefix}.store");
                Route::get('{workspace_record}', [WorkspaceRecordController::class, 'show'])->defaults('kind', $kind)->name("api.v1.{$prefix}.show");
                Route::match(['put', 'patch'], '{workspace_record}', [WorkspaceRecordController::class, 'update'])->defaults('kind', $kind)->name("api.v1.{$prefix}.update");
                Route::delete('{workspace_record}', [WorkspaceRecordController::class, 'destroy'])->defaults('kind', $kind)->name("api.v1.{$prefix}.destroy");
            });
        }
    });
});
