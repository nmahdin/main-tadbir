<?php

namespace App\Core\Operations\Incidents;

enum AlertStatus: string
{
    case OPEN = 'open';
    case ACKNOWLEDGED = 'acknowledged';
    case SUPPRESSED = 'suppressed';
    case RESOLVED = 'resolved';
}
