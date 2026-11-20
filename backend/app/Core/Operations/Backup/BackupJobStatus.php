<?php

namespace App\Core\Operations\Backup;

enum BackupJobStatus: string
{
    case REQUESTED = 'requested';
    case RUNNING = 'running';
    case SUCCEEDED = 'succeeded';
    case FAILED = 'failed';
    case VERIFIED = 'verified';
}
