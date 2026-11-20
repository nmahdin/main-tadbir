<?php

namespace App\Core\Operations\Incidents;

enum IncidentSeverity: string
{
    case CRITICAL = 'critical';
    case HIGH = 'high';
    case MEDIUM = 'medium';
    case LOW = 'low';
    case INFO = 'info';
}
