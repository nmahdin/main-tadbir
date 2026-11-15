<?php

namespace App\Core\Inbox;

/**
 * Lifecycle states for an action-required inbox item. CHECK constraint
 * enforces exactly these values in MySQL/MariaDB; SQLite tests skip
 * CHECKs but the enum still guards service writes.
 */
enum ActionItemStatus: string
{
    case OPEN = 'open';
    case BLOCKED = 'blocked';
    case OVERDUE = 'overdue';
    case RESOLVED = 'resolved';
}
