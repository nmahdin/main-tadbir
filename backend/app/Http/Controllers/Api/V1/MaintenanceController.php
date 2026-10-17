<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ContentDeadlineSweep;
use App\Support\Storage\DatabaseBackup;
use App\Support\Storage\StoragePaths;
use App\Support\Storage\StorageRelocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * نقطهٔ تعمیر بدون SSH.
 *
 * روی هاست‌های اشتراکی که CLI/cron ندارند، مدیر باید بتواند پشتیبان بگیرد،
 * فایل‌ها را به ریشهٔ بیرون از نرم‌افزار منتقل کند و وضعیت مشتق محتوا را
 * تازه کند. این کنترلر هیچ‌گاه در نبودِ کلید سرو نمی‌شود (۴۰۴، نه ۴۰۳)، هیچ
 * مقدار حساسی را برنمی‌گرداند و بازگردانی دیتابیس را عمداً فقط در CLI می‌گذارد.
 *
 * فعال‌سازی: مقدار تصادفی ≥۳۲ کاراکتری در TADBIR_MAINTENANCE_SECRET و سپس
 * فراخوانی با هدر `Authorization: Bearer <secret>`.
 */
final class MaintenanceController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $this->authorizeRequest($request);
        $sweep = app(ContentDeadlineSweep::class);

        return $this->respond([
            'app' => [
                'name' => (string) config('app.name'),
                'env' => (string) config('app.env'),
                'url' => (string) config('app.url'),
                'php' => PHP_VERSION,
            ],
            'database' => [
                'driver' => (string) DB::connection()->getDriverName(),
                'tables' => $this->tableCount(),
                'pending_migrations' => $this->pendingMigrations(),
            ],
            'storage' => [
                'files_root' => StoragePaths::filesRoot(),
                'files_root_external' => ! StoragePaths::isInsideApplication(StoragePaths::filesRoot()),
                'files_root_writable' => StoragePaths::writable(StoragePaths::filesRoot()),
                'backup_root' => StoragePaths::backupRoot(),
                'backup_root_external' => ! StoragePaths::isInsideApplication(StoragePaths::backupRoot()),
                'disk_free_bytes' => StoragePaths::freeBytes(),
                'local_disks' => StoragePaths::localDisks(),
            ],
            'derived_status' => [
                'overdue_open_stage_contents' => $sweep->countDue(),
                'contents_missing_stage_deadline' => $sweep->countUnsynced(),
            ],
            'backups' => app(DatabaseBackup::class)->list(),
        ]);
    }

    public function backup(Request $request): JsonResponse
    {
        $this->authorizeRequest($request);
        $withFiles = $request->boolean('with_files');

        try {
            $result = app(DatabaseBackup::class)->create([
                'label' => (string) $request->input('label', 'manual'),
                'include_files' => $withFiles,
            ]);
        } catch (Throwable $exception) {
            return $this->respond(['ok' => false, 'error' => $exception->getMessage()], 500);
        }

        return $this->respond(['ok' => true] + $result);
    }

    public function relocate(Request $request): JsonResponse
    {
        $this->authorizeRequest($request);
        $relocator = app(StorageRelocator::class);

        if (! $request->boolean('apply')) {
            return $this->respond(['ok' => true] + $relocator->status());
        }

        try {
            $result = $relocator->run(
                (int) $request->input('limit', 200),
                true,
                ! $request->boolean('copy'),
                $request->boolean('prune_source'),
            );
        } catch (Throwable $exception) {
            return $this->respond(['ok' => false, 'error' => $exception->getMessage()], 400);
        }

        return $this->respond(['ok' => true] + $result);
    }

    /** تازه‌سازی وضعیت مشتق محتوا (تأخیر) بدون انتظار برای cron. */
    public function refreshStatus(Request $request): JsonResponse
    {
        $this->authorizeRequest($request);
        $sweep = app(ContentDeadlineSweep::class);
        $limit = max(1, min((int) $request->input('limit', 200), 1000));

        $due = $sweep->refreshDue($limit);
        $unsynced = $sweep->refreshUnsynced($limit);

        return $this->respond([
            'ok' => true,
            'refreshed_overdue' => $due,
            'refreshed_unsynced' => $unsynced,
            'remaining_overdue' => $sweep->countDue(),
            'remaining_unsynced' => $sweep->countUnsynced(),
        ]);
    }

    /**
     * فقط با کلید درست پاسخ می‌دهد؛ در نبود کلید یا کلید نامعتبر ۴۰۴ برمی‌گردد
     * تا وجود این مسیر هم افشا نشود.
     */
    private function authorizeRequest(Request $request): void
    {
        $secret = (string) config('tadbir.maintenance_secret');
        abort_unless(strlen($secret) >= 32, 404);

        $given = (string) ($request->bearerToken() ?: $request->header('X-Tadbir-Maintenance', ''));
        abort_unless($given !== '' && hash_equals($secret, $given), 404);
    }

    private function respond(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status)->header('Cache-Control', 'no-store');
    }

    private function tableCount(): int
    {
        try {
            $row = DB::selectOne('SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()');

            return (int) ($row->total ?? 0);
        } catch (Throwable) {
            // SQLite و هر محیطی که information_schema ندارد.
            try {
                return count(DB::select("SELECT name FROM sqlite_master WHERE type = 'table'"));
            } catch (Throwable) {
                return 0;
            }
        }
    }

    private function pendingMigrations(): int
    {
        try {
            $file = database_path('migrations');
            $files = glob($file.DIRECTORY_SEPARATOR.'*.php') ?: [];
            $ran = DB::table('migrations')->pluck('migration')->all();

            return count(array_diff(array_map(fn (string $path) => basename($path, '.php'), $files), array_map('strval', $ran)));
        } catch (Throwable) {
            return 0;
        }
    }
}
