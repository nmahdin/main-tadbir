<?php

namespace App\Console\Commands\Operations;

use App\Core\Operations\Backup\BackupJobStatus;
use App\Core\Operations\Backup\BackupService;
use App\Core\Operations\Backup\CoreBackupJob;
use Illuminate\Console\Command;

final class RunBackupJob extends Command
{
    protected $signature = 'ops:backup-run {jobId? : Backup job id; runs the latest requested job if omitted}';

    protected $description = 'Execute a pending backup job (C7).';

    public function handle(BackupService $backups): int
    {
        $jobId = $this->argument('jobId');
        $job = $jobId
            ? CoreBackupJob::findOrFail((int) $jobId)
            : CoreBackupJob::query()->where('status', BackupJobStatus::REQUESTED->value)->orderByDesc('id')->first();
        if (! $job) {
            $this->warn('No pending backup job.');

            return self::SUCCESS;
        }
        $job = $backups->execute($job);
        $this->line("Backup job {$job->id} finished with status [{$job->status}].");

        return $job->status === BackupJobStatus::FAILED->value ? self::FAILURE : self::SUCCESS;
    }
}
