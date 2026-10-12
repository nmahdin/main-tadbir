<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Storage\DatabaseBackup;
use App\Support\Storage\StoragePaths;
use App\Support\Storage\StorageRelocator;
use App\Support\Storage\StorageSettings;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings as BaleSettings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Services\ContentDeadlineSweep;
use App\Services\OverdueNotifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * نگهداری سامانه از داخل پنل: پشتیبان‌گیری، دانلود، بارگذاری، بازگردانی و
 * تغییر محل ذخیرهٔ فایل‌ها — همه بدون نیاز به SSH یا دسترسی به پوشهٔ پروژه.
 *
 * دسترسی این مسیرها با مجوز `settings.manage` کنترل می‌شود (در routes/api.php)
 * و عملیات حساس (بازگردانی) علاوه بر آن به تأیید صریح نام فایل نیاز دارد.
 */
final class AdminMaintenanceController extends Controller
{
    public function __construct(private readonly DatabaseBackup $backups) {}

    /** وضعیت ذخیره‌سازی، پایگاه‌داده، پشتیبان‌ها و محدودیت‌های میزبان. */
    public function overview(): JsonResponse
    {
        $filesRoot = StoragePaths::filesRoot();
        $backupRoot = StoragePaths::backupRoot();
        $relocator = new StorageRelocator();
        $status = $relocator->status();

        try {
            $inspect = $this->backups->inspect();
        } catch (Throwable) {
            $inspect = ['driver' => $this->driverName(), 'tables' => [], 'rows' => 0];
        }

        return response()->json([
            'data' => [
                'storage' => [
                    'files_root' => $filesRoot,
                    'inside_application' => StoragePaths::isInsideApplication($filesRoot),
                    'writable' => StoragePaths::writable($filesRoot),
                    'free_bytes' => StoragePaths::freeBytes($filesRoot),
                    'source' => StorageSettings::source(),
                    'configured_files_root' => StorageSettings::configuredFilesRoot(),
                    'legacy_root' => StoragePaths::legacyFilesRoot(),
                    'legacy_files' => $status['source']['files'] ?? 0,
                    'legacy_bytes' => $status['source']['bytes'] ?? 0,
                    'pending_relocation' => (int) ($status['source']['files'] ?? 0),
                    // مسیر پیشنهادی همیشه بیرون از پوشهٔ نرم‌افزار است تا آپدیت به فایل‌ها کاری نداشته باشد.
                    'suggested_root' => $this->suggestedRoot(),
                ],
                'database' => [
                    'driver' => $this->driverName(),
                    'name' => $this->databaseName(),
                    'bytes' => $this->databaseSize(),
                    'tables' => is_array($inspect['tables'] ?? null) ? count($inspect['tables']) : 0,
                    'table_names' => array_values(array_map('strval', (array) ($inspect['tables'] ?? []))),
                    'rows' => (int) ($inspect['rows'] ?? 0),
                ],
                'backups' => $this->backups->list(),
                'backup_root' => [
                    'path' => $backupRoot,
                    'inside_application' => StoragePaths::isInsideApplication($backupRoot),
                    'keep' => (int) config('tadbir.backup_keep', 7),
                ],
                'limits' => [
                    'upload_max_filesize' => $this->iniBytes('upload_max_filesize'),
                    'post_max_size' => $this->iniBytes('post_max_size'),
                    'max_execution_time' => (int) ini_get('max_execution_time'),
                ],
            ],
        ]);
    }

    /** ساخت پشتیبان تازه از پایگاه‌داده (و در صورت درخواست، از فایل‌های آپلودی). */
    public function createBackup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['nullable', 'string', 'max:32'],
            'include_files' => ['nullable', 'boolean'],
        ]);

        try {
            $result = $this->backups->create([
                'label' => $validated['label'] ?? null,
                'include_files' => (bool) ($validated['include_files'] ?? false),
            ]);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        $keep = (int) config('tadbir.backup_keep', 7);
        $removed = $keep > 0 ? $this->backups->prune($keep) : [];

        return response()->json([
            'data' => [
                'file' => $result['file'],
                'bytes' => $result['bytes'] ?? null,
                'rows' => $result['rows'] ?? null,
                'tables' => $result['tables'] ?? null,
                'warnings' => $result['warnings'] ?? [],
                'pruned' => $removed,
                'backups' => $this->backups->list(),
            ],
            'message' => 'پشتیبان پایگاه‌داده ساخته شد.',
        ]);
    }

    /** دانلود فایل پشتیبان از مرورگر. */
    public function downloadBackup(string $file): BinaryFileResponse|JsonResponse
    {
        $path = $this->backupPath($file);

        if ($path === null) {
            return response()->json(['message' => 'فایل پشتیبان پیدا نشد.'], 404);
        }

        return response()->download($path, basename($path), [
            'Content-Type' => 'application/gzip',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function deleteBackup(string $file): JsonResponse
    {
        $path = $this->backupPath($file);

        if ($path === null) {
            return response()->json(['message' => 'فایل پشتیبان پیدا نشد.'], 404);
        }

        $manifest = preg_replace('/\.sql\.gz$/', '.json', $path);
        @unlink($path);
        if (is_string($manifest) && is_file($manifest)) {
            @unlink($manifest);
        }

        return response()->json(['data' => ['backups' => $this->backups->list()], 'message' => 'پشتیبان حذف شد.']);
    }

    /**
     * بارگذاری فایل پشتیبان از رایانهٔ مدیر (برای بازگردانی نسخه‌ای که قبلاً
     * دانلود شده است). فایل در پوشهٔ پشتیبان ذخیره می‌شود و سپس با تأیید همان
     * نام، قابل بازگردانی است.
     */
    public function uploadBackup(Request $request): JsonResponse
    {
        $maxKb = max(1, (int) floor(min(
            $this->iniBytes('upload_max_filesize') ?: 8 * 1024 * 1024,
            $this->iniBytes('post_max_size') ?: 8 * 1024 * 1024,
        ) / 1024));

        $request->validate([
            'file' => ['required', 'file', 'max:'.$maxKb],
        ]);

        $uploaded = $request->file('file');
        $name = (string) $uploaded?->getClientOriginalName();

        if (! str_ends_with(strtolower($name), '.sql.gz')) {
            return response()->json(['message' => 'فقط فایل پشتیبان با پسوند .sql.gz پذیرفته می‌شود.'], 422);
        }

        $target = $this->backupDirectory();
        $safe = preg_replace('/[^A-Za-z0-9._-]+/', '-', basename($name)) ?: 'uploaded.sql.gz';
        $path = $target.DIRECTORY_SEPARATOR.$safe;

        if (is_file($path)) {
            $safe = 'uploaded-'.now()->format('Ymd-His').'-'.$safe;
            $path = $target.DIRECTORY_SEPARATOR.$safe;
        }

        try {
            $uploaded?->move($target, $safe);
        } catch (Throwable $exception) {
            return response()->json(['message' => 'ذخیرهٔ فایل بارگذاری‌شده ممکن نشد: '.$exception->getMessage()], 422);
        }

        return response()->json([
            'data' => ['file' => $safe, 'bytes' => (int) @filesize($path), 'backups' => $this->backups->list()],
            'message' => 'فایل پشتیبان بارگذاری شد؛ برای بازگردانی، نام فایل را تأیید کنید.',
        ]);
    }

    /** بازگردانی پشتیبان با تأیید صریح نام فایل. */
    public function restoreBackup(Request $request, string $file): JsonResponse
    {
        $validated = $request->validate([
            'confirm' => ['required', 'string'],
        ]);

        if (trim($validated['confirm']) !== basename(trim($file))) {
            return response()->json([
                'message' => 'برای بازگردانی باید نام دقیق فایل پشتیبان را تأیید کنید.',
            ], 422);
        }

        // بازگردانی روی هاست‌های اشتراکی می‌تواند زمان‌بر باشد؛ محدودیت اجرا برداشته می‌شود.
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        try {
            $result = $this->backups->restore(basename($file), true);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        } catch (Throwable $exception) {
            return response()->json(['message' => 'بازگردانی ناتمام ماند: '.$exception->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'restored' => basename($file),
                'statements' => $result['statements'] ?? null,
                'safety_backup' => isset($result['safety']) ? basename((string) $result['safety']) : null,
                'backups' => $this->backups->list(),
            ],
            'message' => 'بازگردانی انجام شد؛ پیش از بازگردانی هم یک پشتیبان ایمنی گرفته شد.',
        ]);
    }

    /** ثبت محل ذخیرهٔ فایل‌ها از پنل (و در صورت درخواست، انتقال فایل‌های موجود). */
    public function updateStorage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'files_root' => ['required', 'string', 'max:500'],
            'relocate' => ['nullable', 'boolean'],
        ]);

        $path = rtrim(trim($validated['files_root']), '/\\');

        if (! StorageSettings::usable($path)) {
            return response()->json([
                'message' => 'این مسیر قابل ساخت یا نوشتن نیست. مسیر مطلق یک پوشه روی هاست را وارد کنید '
                    .'(نمونه: /home/USERNAME/tadbir-files) و دسترسی نوشتن آن را بررسی کنید.',
            ], 422);
        }

        $previous = StorageSettings::configuredFilesRoot();
        $result = StorageSettings::setFilesRoot($path);

        $relocation = null;

        if (! empty($validated['relocate']) && $result['previous'] !== null) {
            $relocation = $this->relocate($result['previous'], 200, true, false);
        }

        return response()->json([
            'data' => [
                'files_root' => $result['files_root'],
                'previous' => $result['previous'] ?? $previous,
                'external' => $result['external'],
                'relocation' => $relocation,
            ],
            'message' => $result['changed']
                ? 'محل ذخیرهٔ فایل‌ها ثبت شد. اگر فایل قدیمی دارید، انتقال را کامل کنید.'
                : 'همین مسیر از قبل ثبت شده بود.',
        ]);
    }

    /** ادامهٔ انتقال فایل‌ها به محل تازه (بازه‌بازه و تکرارپذیر). */
    public function relocateStorage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:2000'],
            'apply' => ['nullable', 'boolean'],
            'prune_source' => ['nullable', 'boolean'],
        ]);

        try {
            $result = $this->relocate(
                StorageSettings::previousRoots()[0] ?? null,
                (int) ($validated['limit'] ?? 200),
                (bool) ($validated['apply'] ?? true),
                (bool) ($validated['prune_source'] ?? false),
            );
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'data' => $result,
            'message' => ($result['pending'] ?? 0) > 0
                ? 'انتقال ادامه دارد؛ برای پاک‌شدن بقیهٔ فایل‌ها دوباره اجرا کنید.'
                : 'انتقال فایل‌ها کامل شد.',
        ]);
    }

    /**
     * به‌روزرسانی خودکار، به‌صورت دستی.
     *
     * روی هاستی که cron/scheduler ندارد هیچ‌کدام از تیک‌های زمان‌بندی‌شده اجرا
     * نمی‌شود؛ این مسیر همان کارها را با یک کلیک انجام می‌دهد: هم‌گام‌سازی وضعیت
     * مشتق «تأخیر»، ساخت یادآوری‌های سرسید‌شده و ارسال صف بله. هر سه بخش
     * تکرارپذیر (idempotent) هستند، پس اجرای چندباره اعلان تکراری نمی‌سازد.
     */
    public function runAutomation(Request $request, ContentDeadlineSweep $sweep, OverdueNotifications $overdue): JsonResponse
    {
        $validated = $request->validate([
            'deadlines' => ['nullable', 'boolean'],
            'notifications' => ['nullable', 'boolean'],
            'bale' => ['nullable', 'boolean'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $deadlines = (bool) ($validated['deadlines'] ?? true);
        $notifications = (bool) ($validated['notifications'] ?? true);
        $bale = (bool) ($validated['bale'] ?? true);
        $limit = (int) ($validated['limit'] ?? 200);

        set_time_limit(0);

        $result = [
            'deadlines' => ['due' => 0, 'unsynced' => 0],
            'notifications' => ['scanned' => 0, 'reminders' => 0],
            'bale' => ['enabled' => false, 'sent' => 0, 'received' => 0, 'message' => null],
        ];

        if ($deadlines) {
            $result['deadlines'] = [
                'due' => $sweep->refreshDue($limit),
                'unsynced' => $sweep->refreshUnsynced($limit),
            ];
        }

        if ($notifications) {
            $summary = $overdue->run();
            $result['notifications'] = ['scanned' => $summary['scanned'], 'reminders' => $summary['reminders']];
        }

        if ($bale) {
            $settings = app(BaleSettings::class);
            $result['bale']['enabled'] = $settings->ready();

            if ($settings->ready()) {
                try {
                    $tick = app(RuntimeLock::class)->run(fn () => app(PollingRunner::class)->tick(true));
                    $result['bale']['sent'] = $tick['sent'];
                    $result['bale']['received'] = $tick['received'];
                } catch (Throwable $exception) {
                    // پیام‌های بله هرگز توکن/آدرس را در پاسخ نمی‌آورند.
                    $result['bale']['message'] = $exception instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
                        ? $exception->getMessage()
                        : 'ارسال صف بله کامل نشد؛ تنظیمات ربات را بررسی کنید.';
                }
            } else {
                $result['bale']['message'] = 'ربات بله فعال نیست؛ صف ارسال بررسی نشد.';
            }
        }

        return response()->json([
            'data' => $result,
            'message' => 'به‌روزرسانی دستی انجام شد.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function relocate(?string $from, int $limit, bool $apply, bool $pruneSource): array
    {
        if (is_string($from) && $from !== '' && $from !== StoragePaths::filesRoot()) {
            // دستور انتقال، مبدأ را از پیکربندی می‌خواند؛ مسیر قبلی اینجا نشانده می‌شود.
            config(['tadbir.files_legacy_root' => $from]);
        }

        $result = (new StorageRelocator())->run($limit, $apply, true, $pruneSource);

        return [
            'applied' => $result['applied'] ?? $apply,
            'processed' => $result['processed'] ?? 0,
            'moved' => $result['moved'] ?? 0,
            'copied' => $result['copied'] ?? 0,
            'skipped' => $result['skipped'] ?? 0,
            'failed' => $result['failed'] ?? 0,
            'pending' => $result['pending'] ?? 0,
            'errors' => array_slice((array) ($result['errors'] ?? []), 0, 5),
        ];
    }

    private function backupDirectory(): string
    {
        $dir = StoragePaths::backupRoot().DIRECTORY_SEPARATOR.'db';

        if (! is_dir($dir) && ! @mkdir($dir, 0770, true) && ! is_dir($dir)) {
            throw new RuntimeException('پوشهٔ پشتیبان قابل ساخت نیست: '.$dir);
        }

        return $dir;
    }

    private function backupPath(string $file): ?string
    {
        $name = basename(trim($file));

        if ($name === '' || ! str_ends_with($name, '.sql.gz')) {
            return null;
        }

        try {
            $path = $this->backupDirectory().DIRECTORY_SEPARATOR.$name;
        } catch (RuntimeException) {
            return null;
        }

        return is_file($path) ? $path : null;
    }

    /** مسیر پیشنهادی برای ذخیرهٔ فایل‌ها: کنار پوشهٔ هاست، بیرون از نرم‌افزار. */
    private function suggestedRoot(): string
    {
        $base = base_path();
        $parent = dirname($base);

        return $parent.DIRECTORY_SEPARATOR.'tadbir-files';
    }

    private function driverName(): string
    {
        try {
            return (string) DB::connection()->getDriverName();
        } catch (Throwable) {
            return '';
        }
    }

    private function databaseName(): string
    {
        try {
            return (string) DB::connection()->getDatabaseName();
        } catch (Throwable) {
            return '';
        }
    }

    /** حجم تقریبی پایگاه‌داده به بایت (اگر قابل تعیین باشد). */
    private function databaseSize(): ?int
    {
        try {
            if ($this->driverName() === 'sqlite') {
                $file = $this->databaseName();

                return is_file($file) ? (int) filesize($file) : null;
            }

            $row = DB::connection()->getPdo()
                ->query('SELECT SUM(data_length + index_length) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()')
                ->fetch(\PDO::FETCH_ASSOC);

            return isset($row['bytes']) ? (int) $row['bytes'] : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function iniBytes(string $key): int
    {
        $value = trim((string) ini_get($key));

        if ($value === '') {
            return 0;
        }

        $unit = strtolower(substr($value, -1));
        $number = (int) $value;

        return match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
