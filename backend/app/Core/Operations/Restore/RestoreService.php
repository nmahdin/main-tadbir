<?php

namespace App\Core\Operations\Restore;

use App\Core\Operations\Backup\BackupJobStatus;
use App\Core\Operations\Backup\CoreBackupJob;
use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use DomainException;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Support\Str;
use Throwable;

/**
 * Isolated restore verification (C7-H). Preflight validates the
 * manifest and artifact hashes; restoration runs into a disposable
 * database prefix/storage prefix; health is verified; cleanup
 * disposes of the temporary artifacts. This service NEVER touches
 * the operator's live database and requires an explicit disposable
 * target database name.
 */
final class RestoreService
{
    public function __construct(
        private readonly FilesystemFactory $filesystems,
        private readonly SecurityEventWriter $events,
    ) {}

    /**
     * Begin restore verification against a backup job.
     */
    public function requestVerification(CoreBackupJob $job, ?User $actor = null): CoreRestoreVerification
    {
        if (! in_array($job->status, [BackupJobStatus::SUCCEEDED->value, BackupJobStatus::VERIFIED->value], true)) {
            throw new DomainException('Only succeeded/verified backups can be restored.');
        }
        $verification = CoreRestoreVerification::create([
            'backup_job_id' => $job->id,
            'status' => RestoreVerificationStatus::REQUESTED->value,
            'target_database' => null, // assigned at preflight
            'target_storage_prefix' => null,
            'requested_by_user_id' => $actor?->id,
        ]);
        $this->events->record('ops.restore.requested', SecurityEventOutcome::SUCCESS, $actor, $actor?->id, 'ops_restore_verification', $verification->id, null, null, ['backup_job_id' => $job->id]);

        return $verification;
    }

    /**
     * Run preflight checks: manifest present, all artifacts present
     * with matching hashes, schema_version recorded.
     *
     * @return array{ok:bool,findings:array<string,mixed>}
     */
    public function preflight(CoreRestoreVerification $verification): array
    {
        $job = $verification->backupJob;
        $findings = ['artifacts' => [], 'schema_version_present' => false, 'hash_mismatches' => []];
        $ok = true;
        try {
            $disk = $this->filesystems->disk($job->disk ?: 'local');
            if (! $job->path || ! $disk->exists($job->path)) {
                $ok = false;
                $findings['error'] = 'manifest_missing';
            } else {
                $manifest = json_decode($disk->get($job->path), true);
                if (! is_array($manifest)) {
                    $ok = false;
                    $findings['error'] = 'manifest_invalid';
                } else {
                    $findings['schema_version_present'] = ! empty($manifest['schema_version']);
                    foreach ($manifest['artifacts'] ?? [] as $art) {
                        $exists = isset($art['path']) && $disk->exists($art['path']);
                        $hashOk = false;
                        if ($exists && isset($art['sha256'])) {
                            $hashOk = hash_equals($art['sha256'], hash('sha256', $disk->get($art['path'])));
                        }
                        $findings['artifacts'][] = [
                            'type' => $art['type'] ?? null,
                            'exists' => $exists,
                            'hash_ok' => $hashOk,
                        ];
                        if (! $exists || ! $hashOk) {
                            $ok = false;
                            $findings['hash_mismatches'][] = $art['path'] ?? '?';
                        }
                    }
                }
            }
        } catch (Throwable $e) {
            $ok = false;
            $findings['error'] = 'preflight_exception';
        }
        $verification->preflight = $findings;
        $verification->status = $ok ? RestoreVerificationStatus::PREFLIGHT_PASSED->value : RestoreVerificationStatus::FAILED->value;
        if ($ok) {
            $verification->target_database = 'restore_test_'.Str::lower(Str::random(8));
            $verification->target_storage_prefix = 'restore-tests/'.Str::uuid()->toString();
        }
        $verification->save();

        return ['ok' => $ok, 'findings' => $findings];
    }

    /**
     * Run the isolated restore + health verification. Since we do not
     * have permission to create real disposable databases from within
     * the sandbox, the actual import is performed by an operator-run
     * Artisan command in a controlled environment; this method records
     * a structured failure unless a callable importer/verifier is
     * injected (used by tests).
     *
     * @param  (callable(CoreRestoreVerification): array{ok:bool,findings?:array<string,mixed>})|null  $importer
     * @param  (callable(CoreRestoreVerification): array{ok:bool,findings?:array<string,mixed>})|null  $health
     */
    public function verify(CoreRestoreVerification $verification, ?callable $importer = null, ?callable $health = null): array
    {
        $started = microtime(true);
        $verification->status = RestoreVerificationStatus::RESTORING->value;
        $verification->started_at = now();
        $verification->save();
        try {
            $importResult = $importer !== null
                ? $importer($verification)
                : ['ok' => false, 'error' => 'automated_restore_not_available_in_sandbox'];
            if (! ($importResult['ok'] ?? false)) {
                $verification->status = RestoreVerificationStatus::FAILED->value;
                $verification->error_message = $importResult['error'] ?? 'restore_failed';
                $verification->findings = $importResult['findings'] ?? null;
                $verification->duration_ms = (int) ((microtime(true) - $started) * 1000);
                $verification->finished_at = now();
                $verification->save();

                return ['ok' => false, 'error' => $verification->error_message];
            }
            $verification->status = RestoreVerificationStatus::RESTORED->value;
            $verification->save();

            $healthResult = $health !== null
                ? $health($verification)
                : ['ok' => false, 'error' => 'health_check_not_available_in_sandbox'];
            if (! ($healthResult['ok'] ?? false)) {
                $verification->status = RestoreVerificationStatus::FAILED->value;
                $verification->error_message = $healthResult['error'] ?? 'health_check_failed';
                $verification->findings = array_merge($verification->findings ?? [], $healthResult['findings'] ?? []);
            } else {
                $verification->status = RestoreVerificationStatus::VERIFIED->value;
                $verification->findings = array_merge($verification->findings ?? [], $healthResult['findings'] ?? []);
            }
            $verification->duration_ms = (int) ((microtime(true) - $started) * 1000);
            $verification->finished_at = now();
            $verification->save();

            return ['ok' => $verification->status === RestoreVerificationStatus::VERIFIED->value, 'findings' => $verification->findings];
        } catch (Throwable $e) {
            $verification->status = RestoreVerificationStatus::FAILED->value;
            $verification->error_message = substr($e->getMessage(), 0, 1000);
            $verification->duration_ms = (int) ((microtime(true) - $started) * 1000);
            $verification->finished_at = now();
            $verification->save();

            return ['ok' => false, 'error' => $verification->error_message];
        }
    }
}
