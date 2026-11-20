<?php

namespace App\Core\Operations\Restore;

use App\Core\Operations\Backup\CoreBackupJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoreRestoreVerification extends Model
{
    protected $table = 'ops_restore_verifications';

    protected $fillable = [
        'backup_job_id', 'status', 'target_database', 'target_storage_prefix',
        'preflight', 'findings', 'error_message', 'duration_ms',
        'started_at', 'finished_at', 'requested_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'preflight' => 'array',
            'findings' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function backupJob(): BelongsTo
    {
        return $this->belongsTo(CoreBackupJob::class, 'backup_job_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }
}
