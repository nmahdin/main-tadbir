<?php

namespace App\Core\Operations\Incidents;

enum IncidentStatus: string
{
    case OPEN = 'open';
    case ACKNOWLEDGED = 'acknowledged';
    case INVESTIGATING = 'investigating';
    case MITIGATED = 'mitigated';
    case RESOLVED = 'resolved';

    /**
     * @return array<int, self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::OPEN => [self::ACKNOWLEDGED, self::INVESTIGATING, self::RESOLVED],
            self::ACKNOWLEDGED => [self::INVESTIGATING, self::MITIGATED, self::RESOLVED],
            self::INVESTIGATING => [self::MITIGATED, self::RESOLVED],
            self::MITIGATED => [self::RESOLVED, self::INVESTIGATING],
            self::RESOLVED => [self::OPEN], // reopen
        };
    }
}
