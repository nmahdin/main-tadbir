<?php

namespace App\Core\Modules;

use InvalidArgumentException;

/**
 * Immutable description of one registered module.
 *
 * This is the complete public registration contract for Stage 02: a stable
 * module id plus the stable permission keys the module owns. Routes, events
 * and settings are registered by later stages only when a real module needs
 * them; no speculative fields are carried here.
 */
final readonly class ModuleManifest
{
    /**
     * @param  array<int, string>  $permissions  Stable dotted permission keys owned by the module.
     */
    public function __construct(
        public string $id,
        public array $permissions = [],
    ) {
        if (preg_match('/^[a-z][a-z0-9_-]*$/', $id) !== 1) {
            throw new InvalidArgumentException("Module id [{$id}] must be a stable lower-case identifier.");
        }

        foreach ($permissions as $permission) {
            if (! is_string($permission) || preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/', $permission) !== 1) {
                throw new InvalidArgumentException("Permission key [{$permission}] owned by module [{$id}] is not a stable dotted key.");
            }
        }
    }
}
