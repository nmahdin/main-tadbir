<?php

namespace App\Core\Operations\Maintenance;

enum MaintenanceStatus: string
{
    case SCHEDULED = 'scheduled';
    case ACTIVE = 'active';
    case COMPLETED = 'completed';
    case CANCELLED = 'cancelled';
}
