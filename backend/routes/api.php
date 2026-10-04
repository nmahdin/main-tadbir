<?php

use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\ApprovalController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\Bale\BaleAccountController;
use App\Http\Controllers\Api\V1\Bale\BaleAssetAccessController;
use App\Http\Controllers\Api\V1\Bale\BaleOperationsController;
use App\Http\Controllers\Api\V1\Bale\BaleSettingsController;
use App\Http\Controllers\Api\V1\Bale\BaleTransportController;
use App\Http\Controllers\Api\V1\CommentController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\DamAssetController;
use App\Http\Controllers\Api\V1\DamDataTableController;
use App\Http\Controllers\Api\V1\DamTaxonomyController;
use App\Http\Controllers\Api\V1\DepartmentController;
use App\Http\Controllers\Api\V1\DepartmentDashboardController;
use App\Http\Controllers\Api\V1\DomainRecordController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\GlobalSearchController;
use App\Http\Controllers\Api\V1\NotificationInboxController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\ProjectTemplateController;
use App\Http\Controllers\Api\V1\RestoreController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SystemSettingController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WorkspaceRecordController;
use App\Http\Middleware\EnsureDepartmentStructure;
use App\Models\DomainRecord;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

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
    Route::post('bot/bale/webhook', [BaleTransportController::class, 'webhook'])->middleware('throttle:30,1')->name('api.v1.bot.bale.webhook');
    Route::post('bot/bale/webhook/{secret}', [BaleTransportController::class, 'receive'])->where('secret', '[a-f0-9]{64}')->middleware('throttle:120,1');
    Route::post('bot/bale/tick', [BaleTransportController::class, 'tick'])->middleware('throttle:30,1');

    // بررسی سلامت بدون نیاز به احراز هویت
    // سلامت عمومی و بدون نشست است؛ فراخوانی از صفحهٔ وضعیت یا پنل نباید فایل/ردیف نشست بسازد.
    Route::get('health', [HealthController::class, 'api'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->name('api.v1.health');
    Route::get('health/db', [HealthController::class, 'db'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->name('api.v1.health.db');
    Route::get('public/identity', [SystemSettingController::class, 'publicIdentity'])
        ->middleware('throttle:60,1')
        ->name('api.v1.public.identity');

    // ورود و ثبت‌نام مرورگر همیشه از middleware وب عبور می‌کنند تا Laravel
    // نشست، CSRF و Set-Cookie را سمت سرور مدیریت کند. middleware تشخیص خودکار
    // Sanctum برای این دو مسیر حذف شده تا session stack دوبار اجرا نشود.
    Route::post('auth/login', [AuthController::class, 'login'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:20,1,auth-login'])
        ->name('api.v1.auth.login');
    Route::post('auth/register', [AuthController::class, 'register'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:5,1,auth-register'])
        ->name('api.v1.auth.register');
    Route::post('auth/bale/code', [AuthController::class, 'baleCode'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:8,1,auth-bale-code']);
    Route::post('auth/bale/login', [AuthController::class, 'baleLogin'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:10,1,auth-bale-login']);
    Route::post('auth/bale/panel', [AuthController::class, 'balePanelLogin'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:10,1,auth-bale-panel']);
    Route::post('auth/bale/password/reset', [AuthController::class, 'baleResetPassword'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware(['web', 'throttle:8,1,auth-bale-reset']);

    // کلاینت‌های غیرمرورگری token را از مسیر مستقل دریافت می‌کنند؛ SPA از آن استفاده نمی‌کند.
    Route::post('auth/token', [AuthController::class, 'token'])
        ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)
        ->middleware('throttle:20,1,auth-token')
        ->name('api.v1.auth.token');

    Route::middleware(['auth:sanctum', 'active-account', EnsureDepartmentStructure::class])->group(function (): void {
        Route::prefix('bale')->middleware('throttle:30,1')->group(function (): void {
            $settings = BaleSettingsController::class;
            Route::middleware('permission:settings.manage')->group(function () use ($settings): void {
                Route::get('settings', [$settings, 'show']);
                Route::put('settings', [$settings, 'update']);
                Route::match(['get', 'put'], 'settings/automations', [$settings, 'automations']);
                Route::post('settings/test', [$settings, 'test']);
                Route::post('settings/webhook', [$settings, 'webhook']);
                Route::delete('settings', [$settings, 'disconnect']);
            });
            $account = BaleAccountController::class;
            $operations = BaleOperationsController::class;
            Route::post('account/test-notification', [$operations, 'testNotification'])->middleware('throttle:3,1,bale-notification-test');
            Route::put('account/preferences', [$operations, 'preferences']);
            Route::middleware('permission:meetings.edit')->group(function () use ($operations): void {
                Route::get('meetings/{meeting}/reminder', [$operations, 'preview']);
                Route::post('meetings/{meeting}/reminder', [$operations, 'remind']);
                Route::post('meetings/{meeting}/reminder/{run}/deliver', [$operations, 'deliverRun'])->whereNumber('run');
            });
            $assets = BaleAssetAccessController::class;
            Route::middleware('permission:assets.manage_access')->group(function () use ($assets): void {
                Route::get('asset-tables', [$assets, 'index']);
                Route::get('asset-tables/{table}/departments', [$assets, 'show']);
                Route::put('asset-tables/{table}/departments', [$assets, 'update']);
            });
            Route::get('account', [$account, 'show']);
            Route::post('account/code', [$account, 'code']);
            Route::delete('account', [$account, 'disconnect']);
        });

        Route::get('auth/me', [AuthController::class, 'me'])->name('api.v1.auth.me');
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('api.v1.auth.logout');

        Route::get('search', GlobalSearchController::class)
            ->middleware('throttle:60,1,global-search')
            ->name('api.v1.search');
        Route::get('analytics/summary', AnalyticsController::class)
            ->middleware(['permission:reports.view', 'throttle:30,1,analytics-summary'])
            ->name('api.v1.analytics.summary');

        Route::post('think-tank-meetings/{meeting}/actions/{action}/task', [WorkspaceRecordController::class, 'convertAction'])->middleware('throttle:30,1,meeting-action');
        Route::post('think-tank-meetings/{meeting}/google-meet', [WorkspaceRecordController::class, 'createGoogleMeet'])->middleware('throttle:10,1,google-meet');

        // ماژول‌های عمومی سامانه
        Route::get('roles', [RoleController::class, 'index'])->middleware('permission:roles.view')->name('api.v1.roles.index');
        Route::post('roles', [RoleController::class, 'store'])->middleware('permission:roles.create')->name('api.v1.roles.store');
        Route::put('roles/permissions', [RoleController::class, 'updatePermissions'])->middleware('permission:roles.manage_permissions')->name('api.v1.roles.permissions.update');
        Route::match(['put', 'patch'], 'roles/{role}', [RoleController::class, 'update'])->middleware('permission:roles.edit,roles.manage_permissions')->name('api.v1.roles.update');
        Route::delete('roles/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete')->name('api.v1.roles.destroy');

        Route::match(['get', 'post'], 'departments/consolidation', [DepartmentController::class, 'consolidation'])->middleware('throttle:30,1');
        Route::get('departments/directory', [DepartmentController::class, 'directory'])->middleware('throttle:60,1')->name('api.v1.departments.directory');
        Route::get('departments/managed', [DepartmentController::class, 'managed'])->middleware('throttle:60,1')->name('api.v1.departments.managed');
        Route::get('departments/{department}/dashboard', DepartmentDashboardController::class)->middleware('throttle:60,1')->name('api.v1.departments.dashboard');
        Route::get('departments', [DepartmentController::class, 'index'])->middleware('permission:departments.view')->name('api.v1.departments.index');
        Route::post('departments', [DepartmentController::class, 'store'])->middleware('permission:departments.create')->name('api.v1.departments.store');
        Route::match(['put', 'patch'], 'departments/{department}', [DepartmentController::class, 'update'])->middleware('permission:departments.edit')->name('api.v1.departments.update');
        Route::delete('departments/{department}', [DepartmentController::class, 'destroy'])->middleware('permission:departments.delete')->name('api.v1.departments.destroy');

        Route::get('project-templates', [ProjectTemplateController::class, 'index'])->middleware('permission:projects.view')->name('api.v1.project-templates.index');
        Route::post('project-templates', [ProjectTemplateController::class, 'store'])->middleware('permission:projects.create')->name('api.v1.project-templates.store');
        Route::match(['put', 'patch'], 'project-templates/{project_template}', [ProjectTemplateController::class, 'update'])->middleware('permission:projects.create')->name('api.v1.project-templates.update');
        Route::delete('project-templates/{project_template}', [ProjectTemplateController::class, 'destroy'])->middleware('permission:projects.delete')->name('api.v1.project-templates.destroy');

        Route::get('activity-logs', [ActivityLogController::class, 'index'])->name('api.v1.activity-logs.index');
        Route::post('activity-logs', [ActivityLogController::class, 'store'])->name('api.v1.activity-logs.store');

        Route::get('settings', [SystemSettingController::class, 'index'])->name('api.v1.settings.index');
        Route::get('settings/{key}', [SystemSettingController::class, 'show'])->name('api.v1.settings.show');
        Route::match(['put', 'patch'], 'settings/{key}', [SystemSettingController::class, 'update'])->name('api.v1.settings.update');

        // مخزن واقعی DAM؛ مسیرهای legacy زیر /dam/assets تا مهاجرت داده‌ها محفوظ‌اند.
        Route::get('dam/library/folders', [DamTaxonomyController::class, 'folders']);
        Route::post('dam/library/folders', [DamTaxonomyController::class, 'createFolder']);
        Route::patch('dam/library/folders/{folder}', [DamTaxonomyController::class, 'updateFolder']);
        Route::delete('dam/library/folders/{folder}', [DamTaxonomyController::class, 'destroyFolder']);
        Route::get('dam/library/categories', [DamTaxonomyController::class, 'categories']);
        Route::post('dam/library/categories', [DamTaxonomyController::class, 'createCategory']);
        Route::patch('dam/library/categories/{category}', [DamTaxonomyController::class, 'updateCategory']);
        Route::delete('dam/library/categories/{category}', [DamTaxonomyController::class, 'destroyCategory']);
        // جدول‌های اطلاعات (شیت‌های شبه‌اکسل)
        Route::get('dam/data-tables/rows-by-task', [DamDataTableController::class, 'rowsByTask']);
        Route::get('dam/data-tables', [DamDataTableController::class, 'index']);
        Route::post('dam/data-tables', [DamDataTableController::class, 'store']);
        Route::get('dam/data-tables/{data_table}', [DamDataTableController::class, 'show']);
        Route::match(['put', 'patch'], 'dam/data-tables/{data_table}', [DamDataTableController::class, 'update']);
        Route::delete('dam/data-tables/{data_table}', [DamDataTableController::class, 'destroy']);
        Route::post('dam/data-tables/{data_table}/rows', [DamDataTableController::class, 'storeRow']);
        Route::match(['put', 'patch'], 'dam/data-tables/{data_table}/rows/{row}', [DamDataTableController::class, 'updateRow']);
        Route::delete('dam/data-tables/{data_table}/rows/{row}', [DamDataTableController::class, 'destroyRow']);
        Route::get('dam/data-tables/{data_table}/rows/{row}/activities', [DamDataTableController::class, 'rowActivities']);
        Route::get('dam/library/summary', [DamAssetController::class, 'summary']);
        Route::get('dam/library/activities', [DamAssetController::class, 'activities']);
        Route::post('dam/library/bulk/move', [DamAssetController::class, 'bulkMove']);
        Route::post('dam/library/bulk/archive', [DamAssetController::class, 'bulkArchive']);
        Route::get('dam/library', [DamAssetController::class, 'index']);
        Route::post('dam/library', [DamAssetController::class, 'store']);
        Route::get('dam/library/{asset}', [DamAssetController::class, 'show']);
        Route::patch('dam/library/{asset}', [DamAssetController::class, 'update']);
        Route::delete('dam/library/{asset}', [DamAssetController::class, 'destroy']);
        Route::post('dam/library/{asset}/restore', [DamAssetController::class, 'restore']);
        Route::get('dam/library/{asset}/preview', [DamAssetController::class, 'preview']);
        Route::get('dam/library/{asset}/download', [DamAssetController::class, 'download']);
        Route::post('dam/library/{asset}/versions', [DamAssetController::class, 'revise']);
        Route::post('dam/library/{asset}/versions/{version}/restore', [DamAssetController::class, 'restoreVersion']);
        Route::delete('dam/library/{asset}/tasks/{task}', [DamAssetController::class, 'detachTask'])->whereNumber('task');
        Route::post('dam/library/{asset}/relations', [DamAssetController::class, 'attach']);

        Route::post('notifications/read-all', [NotificationInboxController::class, 'readAll'])->middleware('throttle:10,1,notification-read-all');
        // اعلان‌ها، DAM و چت — از طریق کنترلر عمومی رکوردهای دامنه
        foreach ([
            'notifications' => DomainRecord::DOMAIN_NOTIFICATION,
            'dam/folders' => DomainRecord::DOMAIN_ASSET_FOLDER,
            'dam/assets' => DomainRecord::DOMAIN_ASSET,
            'chat/conversations' => DomainRecord::DOMAIN_CONVERSATION,
            'chat/messages' => DomainRecord::DOMAIN_CHAT_MESSAGE,
        ] as $prefix => $domain) {
            Route::prefix($prefix)->group(function () use ($prefix, $domain): void {
                Route::get('/', [DomainRecordController::class, 'index'])->defaults('domain', $domain)->name("api.v1.{$prefix}.index");
                Route::post('/', [DomainRecordController::class, 'store'])->defaults('domain', $domain)->name("api.v1.{$prefix}.store")->middleware($domain === DomainRecord::DOMAIN_NOTIFICATION ? ['throttle:60,1'] : []);
                Route::post('batch-delete', [DomainRecordController::class, 'destroyBatch'])->defaults('domain', $domain)->name("api.v1.{$prefix}.batch-delete");
                Route::get('{domain_record}', [DomainRecordController::class, 'show'])->defaults('domain', $domain)->name("api.v1.{$prefix}.show");
                Route::match(['put', 'patch'], '{domain_record}', [DomainRecordController::class, 'update'])->defaults('domain', $domain)->name("api.v1.{$prefix}.update");
                Route::delete('{domain_record}', [DomainRecordController::class, 'destroy'])->defaults('domain', $domain)->name("api.v1.{$prefix}.destroy");
            });
        }

        Route::post('{module}/{id}/restore', RestoreController::class)->whereIn('module', ['projects', 'tasks', 'contents'])->whereNumber('id');

        Route::get('comments', [CommentController::class, 'index'])->name('api.v1.comments.index');
        Route::post('comments', [CommentController::class, 'store'])->middleware('throttle:30,1,comment')->name('api.v1.comments.store');
        Route::patch('comments/{comment}', [CommentController::class, 'update'])->middleware('throttle:30,1,comment')->name('api.v1.comments.update');
        Route::delete('comments/{comment}', [CommentController::class, 'destroy'])->name('api.v1.comments.destroy');

        Route::get('projects', [ProjectController::class, 'index'])->middleware('permission:projects.view');
        Route::post('projects', [ProjectController::class, 'store'])->middleware('permission:projects.create');
        Route::get('projects/{project}', [ProjectController::class, 'show'])->middleware('permission:projects.view');
        Route::match(['put', 'patch'], 'projects/{project}', [ProjectController::class, 'update'])->middleware('permission:projects.edit');
        Route::delete('projects/{project}', [ProjectController::class, 'destroy'])->middleware('permission:projects.delete');
        Route::get('approvals', [ApprovalController::class, 'index']);
        Route::post('contents/{content}/stages/{stage}/outputs/{output}/forward', [ApprovalController::class, 'forwardOutput'])
            ->middleware('throttle:30,1,content-output-forward');
        Route::post('contents/{content}/stages/{stage}/decision', [ApprovalController::class, 'decide'])->middleware('permission:content.approve');
        Route::get('contents', [ContentController::class, 'index']);
        Route::post('contents', [ContentController::class, 'store'])->middleware('permission:content.create');
        Route::post('contents/{content}/publish', [ContentController::class, 'publish'])->middleware('permission:content.publish');
        Route::post('contents/{content}/unpublish', [ContentController::class, 'unpublish'])->middleware('permission:content.publish');
        Route::put('contents/{content}/publication-settings', [ContentController::class, 'publicationSettings'])->middleware('permission:content.publish');
        Route::post('contents/{content}/publication-task', [ContentController::class, 'publicationTask'])->middleware('permission:tasks.create');
        Route::get('contents/{content}', [ContentController::class, 'show']);
        Route::match(['put', 'patch'], 'contents/{content}', [ContentController::class, 'update']);
        // Normal delete = archive. The permanent variant is a separate, administrator-only command.
        Route::delete('contents/{content}', [ContentController::class, 'destroy'])->middleware('permission:content.delete');
        Route::delete('contents/{content}/force', [ContentController::class, 'forceDestroy'])->middleware('permission:content.force_delete');
        Route::delete('tasks/{task}/attachments/{attachment}', [TaskController::class, 'removeAttachment'])->whereNumber('attachment')->middleware('permission:tasks.view');
        Route::post('tasks/{task}/comments', [TaskController::class, 'comment'])->middleware(['permission:tasks.view', 'throttle:30,1,task-comment']);
        Route::get('tasks', [TaskController::class, 'index'])->middleware('permission:tasks.view')->name('api.v1.tasks.index');
        Route::post('tasks', [TaskController::class, 'store'])->middleware('permission:tasks.create')->name('api.v1.tasks.store');
        Route::get('tasks/{task}', [TaskController::class, 'show'])->middleware('permission:tasks.view')->name('api.v1.tasks.show');
        Route::match(['put', 'patch'], 'tasks/{task}', [TaskController::class, 'update'])->middleware('permission:tasks.view')->name('api.v1.tasks.update');
        Route::delete('tasks/{task}', [TaskController::class, 'destroy'])->middleware('permission:tasks.delete')->name('api.v1.tasks.destroy');
        Route::get('users/directory', [UserController::class, 'directory'])->name('api.v1.users.directory');
        Route::post('users/{user}/avatar', [UserController::class, 'avatar'])->name('api.v1.users.avatar');
        Route::get('users', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.create');
        Route::match(['put', 'patch'], 'users/{user}', [UserController::class, 'update']);
        Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
        // Authorization for status changes is handled inside the controller:
        // users with tasks.status can move any task, the assignee can move their own.
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
