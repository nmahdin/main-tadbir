<?php

namespace App\Core\Modules;

use InvalidArgumentException;

/**
 * One canonical, code-defined business module definition
 * (Stage C4-1).
 *
 * @param  list<string>  $dependencies  Direct prerequisite module keys.
 */
final readonly class ModuleDefinition
{
    public function __construct(
        public string $key,
        public string $name,
        public ModuleAvailability $availability,
        public array $dependencies = [],
    ) {
        if (preg_match('/^[a-z][a-z0-9_-]*$/', $key) !== 1) {
            throw new InvalidArgumentException("Module key [{$key}] must be a stable lower-case identifier.");
        }
    }

    public function isAvailable(): bool
    {
        return $this->availability->isAvailable();
    }
}
