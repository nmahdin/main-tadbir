<?php

namespace App\Core\Modules;

use DomainException;

/** Persisted registry data conflicts with the canonical
 *  code-defined catalog; synchronization refused to overwrite it. */
final class ModuleRegistryConflictException extends DomainException {}
