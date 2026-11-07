<?php

namespace App\Core\Modules;

/**
 * Technical availability of a catalog module (Stage C4-1):
 * whether an implementation exists that could ever be activated.
 * Planned-but-unimplemented modules are Unavailable and must
 * never be presented or treated as operationally activatable.
 * Availability says nothing about entitlement or workspace
 * activation — those are separate, later decisions.
 */
enum ModuleAvailability: string
{
    case Available = 'available';
    case Unavailable = 'unavailable';

    public function isAvailable(): bool
    {
        return $this === self::Available;
    }
}
