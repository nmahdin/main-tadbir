<?php

namespace App\Core\Operations\Backup;

enum BackupJobType: string
{
    case FULL = 'full';
    case DATABASE = 'database';
    case FILES = 'files';
    case METADATA = 'metadata';
}
