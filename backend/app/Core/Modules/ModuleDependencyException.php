<?php

namespace App\Core\Modules;

use DomainException;

/**
 * A module dependency graph problem. `errorCode` is stable:
 * unknown_module, missing_dependency, self_dependency,
 * duplicate_dependency, dependency_cycle.
 */
final class ModuleDependencyException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
