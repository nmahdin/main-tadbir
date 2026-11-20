<?php

namespace App\Console\Commands\Operations;

use App\Core\Operations\Backup\CoreBackupJob;
use App\Core\Operations\Restore\RestoreService;
use Illuminate\Console\Command;
use RuntimeException;

final class VerifyRestore extends Command
{
    protected $signature = 'ops:backup:verify-restore
        {--backup= : Backup job id; defaults to the most recent succeeded backup}
        {--preflight-only : Only run preflight checks (no real import)}';

    protected $description = 'Run isolated restore verification for a backup (C7-H).';

    public function handle(RestoreService $restore): int
    {
        $jobId = $this->option('backup');
        $job = $jobId
            ? CoreBackupJob::findOrFail((int) $jobId)
            : CoreBackupJob::query()->where('status', 'succeeded')->orderByDesc('finished_at')->first();
        if (! $job) {
            $this->error('No succeeded backup found.');

            return self::FAILURE;
        }
        $this->info("Using backup job #{$job->id} ({$job->finished_at}).");
        try {
            $verification = $restore->requestVerification($job);
            $this->info("Created verification #{$verification->id} -> {$verification->target_database}");
            $preflight = $restore->preflight($verification);
            $this->line('Preflight: '.json_encode($preflight, JSON_UNESCAPED_SLASHES));
            if ($this->option('preflight-only')) {
                return self::SUCCESS;
            }
            if (! ($preflight['ok'] ?? false)) {
                $this->error('Preflight failed; skipping actual restore.');

                return self::FAILURE;
            }
            $result = $restore->verify($verification);
            $this->line('Verification: '.json_encode($result, JSON_UNESCAPED_SLASHES));

            return ($result['ok'] ?? false) ? self::SUCCESS : self::FAILURE;
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }
}
