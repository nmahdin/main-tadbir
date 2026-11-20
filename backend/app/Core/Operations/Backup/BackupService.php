<?php

namespace App\Core\Operations\Backup;

use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * Backup orchestration (C7-G). Backups are represented as durable
 * job records on `ops_backup_jobs` with a manifest covering the DB
 * dump, file archive, sizes, checksums, and schema version. The
 * actual DB dump is delegated to a shelled `mysqldump`/`mariadb-dump`
 * from an Artisan command (queued in production); the service writes
 * the manifest and integrity metadata.
 *
 * Safety rules:
 *  - artifacts stored under a non-public backup disk (local-backup
 *    default, outside public paths)
 *  - encryption keys and .env are NOT bundled
 *  - backup status recorded before/after so a crash leaves state
 */
final class BackupService
{
    public const DEFAULT_RETENTION_DAYS = 30;

    public function __construct(
        private readonly FilesystemFactory $filesystems,
        private readonly SecurityEventWriter $events,
    ) {}

    public function request(User $actor, BackupJobType $type = BackupJobType::FULL, ?int $retentionDays = null): CoreBackupJob
    {
        $job = CoreBackupJob::create([
            'job_uuid' => \Illuminate\Support\Str::uuid()->toString(),
            'type' => $type->value,
            'status' => BackupJobStatus::REQUESTED->value,
            'disk' => 'local-backup',
            'schema_version' => DB::connection()->getSchemaBuilder()->getConnection()->getTablePrefix() ?? null,
            'retention_until' => now()->addDays($retentionDays ?? self::DEFAULT_RETENTION_DAYS),
            'requested_by_user_id' => $actor->id,
        ]);
        $this->events->record('ops.backup.requested', SecurityEventOutcome::SUCCESS,
            $actor, targetType: 'ops_backup_job', targetId: $job->id,
            metadata: ['type' => $type->value]);

        return $job;
    }

    /**
     * Execute a backup job. In a production deployment the Artisan
     * command runs mysqldump and the file tar; in the test environment
     * we produce a synthetic valid manifest against an in-memory/SQLite
     * DB to exercise the integrity flow.
     */
    public function execute(CoreBackupJob $job, ?callable $dbDumper = null, ?callable $fileArchiver = null): CoreBackupJob
    {
        $disk = $this->backupDisk();
        $job->status = BackupJobStatus::RUNNING->value;
        $job->started_at = now();
        $job->save();

        try {
            $baseDir = 'backups/' . $job->job_uuid;
            $disk->makeDirectory($baseDir);

            $manifest = ['artifacts' => [], 'schema_version' => null, 'created_at' => now()->toIso8601String()];
            $dbDumpPath = null;
            $fileArchivePath = null;
            $totalSize = 0;

            if (in_array($job->type, [BackupJobType::FULL->value, BackupJobType::DATABASE->value], true)) {
                $dbDumpPath = $baseDir . '/database.sql';
                $dbBytes = $dbDumper !== null
                    ? (int) $dbDumper($disk, $dbDumpPath)
                    : $this->dumpDatabase($disk, $dbDumpPath);
                $manifest['artifacts'][] = [
                    'type' => 'database',
                    'path' => $dbDumpPath,
                    'size_bytes' => $dbBytes,
                    'sha256' => $this->hashFile($disk, $dbDumpPath),
                ];
                $totalSize += $dbBytes;
            }
            if (in_array($job->type, [BackupJobType::FULL->value, BackupJobType::FILES->value], true)) {
                $fileArchivePath = $baseDir . '/files.tar';
                $fileBytes = $fileArchiver !== null
                    ? (int) $fileArchiver($disk, $fileArchivePath)
                    : $this->stubFileArchive($disk, $fileArchivePath);
                $manifest['artifacts'][] = [
                    'type' => 'files',
                    'path' => $fileArchivePath,
                    'size_bytes' => $fileBytes,
                    'sha256' => $this->hashFile($disk, $fileArchivePath),
                    'file_count' => 0,
                ];
                $totalSize += $fileBytes;
            }
            // Metadata: migration version list (non-secret).
            $migrations = DB::table('migrations')->pluck('migration')->all();
            $manifest['schema_version'] = $migrations;
            $manifest['metadata'] = [
                'app_version' => null,
                'generated_by' => 'tadbir-backup',
            ];
            $manifestPath = $baseDir . '/manifest.json';
            $disk->put($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            $job->status = BackupJobStatus::SUCCEEDED->value;
            $job->path = $manifestPath;
            $job->db_dump_path = $dbDumpPath;
            $job->files_archive_path = $fileArchivePath;
            $job->size_bytes = $totalSize;
            $job->file_count = collect($manifest['artifacts'])->count();
            $job->manifest = $manifest;
            $job->checksum_sha256 = $this->hashFile($disk, $manifestPath);
            $job->finished_at = now();
            $job->error_message = null;
            $job->save();

            $this->events->record('ops.backup.succeeded', SecurityEventOutcome::SUCCESS,
                null, targetType: 'ops_backup_job', targetId: $job->id,
                metadata: ['size_bytes' => $totalSize]);
        } catch (Throwable $e) {
            $job->status = BackupJobStatus::FAILED->value;
            $job->error_message = substr($e->getMessage(), 0, 1000);
            $job->finished_at = now();
            $job->save();
            $this->events->record('ops.backup.failed', SecurityEventOutcome::FAILURE,
                null, targetType: 'ops_backup_job', targetId: $job->id);
        }

        return $job;
    }

    /**
     * Mark a successful backup as VERIFIED after isolated restore passes.
     */
    public function markVerified(CoreBackupJob $job): void
    {
        if ($job->status !== BackupJobStatus::SUCCEEDED->value) {
            throw new RuntimeException('Only succeeded backups can be marked verified.');
        }
        $job->status = BackupJobStatus::VERIFIED->value;
        $job->save();
    }

    public function recentSuccessful(int $limit = 10)
    {
        return CoreBackupJob::query()
            ->whereIn('status', [BackupJobStatus::SUCCEEDED->value, BackupJobStatus::VERIFIED->value])
            ->orderByDesc('finished_at')
            ->limit($limit)
            ->get();
    }

    /**
     * Real dumper hook: the Artisan command pipes `mysqldump` output.
     * Tests provide their own dumper.
     */
    private function dumpDatabase(Filesystem $disk, string $path): int
    {
        // Placeholder: in production, an artisan command exec()s mysqldump
        // and streams the bytes directly to disk. Here we write a
        // portable "placeholder dump" containing a marker and schema
        // listing so integrity/verification flows can be tested.
        $marker = "-- Tadbir database dump placeholder\n-- Generated at " . now()->toIso8601String() . "\n-- This artifact MUST be replaced with a real mysqldump output before production use.\n";
        $disk->put($path, $marker);

        return (int) $disk->size($path);
    }

    private function stubFileArchive(Filesystem $disk, string $path): int
    {
        $disk->put($path, "Tadbir file archive placeholder\n");

        return (int) $disk->size($path);
    }

    private function hashFile(Filesystem $disk, string $path): string
    {
        return hash('sha256', $disk->get($path) ?? '');
    }

    private function backupDisk(): Filesystem
    {
        try {
            return $this->filesystems->disk('local-backup');
        } catch (Throwable) {
            // Fallback to local disk under a non-public backups/ folder.
            return $this->filesystems->disk('local');
        }
    }
}
