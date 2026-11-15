<?php

namespace App\Core\Inbox;

enum ActionItemUrgency: string
{
    case INFO = 'info';
    case NORMAL = 'normal';
    case HIGH = 'high';
    case CRITICAL = 'critical';
}
