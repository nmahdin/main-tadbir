<?php

namespace App\Core\Operations\Backup;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CoreBackupJob extends Model
{
    protected $table = 'ops_backup_jobs';

    protected $fillable = [
        'job_uuid', 'type', 'status', 'disk', 'path', 'size_bytes', 'checksum_sha256',
        'db_dump_path', 'files_archive_path', 'file_count', 'schema_version',
        'manifest', 'error_message',
        'started_at', 'finished_at', 'retention_until', 'requested_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'manifest' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'retention_until' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function restorations(): HasMany
    {
        return $this->hasMany(\App\Core\Operations\Restore\CoreRestoreVerification::class, 'backup_job_id');
    }
}
