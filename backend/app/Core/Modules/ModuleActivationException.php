<?php

namespace App\Core\Modules;

use DomainException;

/**
 * A module activation/deactivation operation was rejected.
 * `errorCode` is a stable, HTTP-compatible domain code:
 *
 *  module_unknown (422), module_unavailable (422),
 *  organization_policy_denied (403), entitlement_missing (403),
 *  module_activation_preview_stale (409),
 *  module_has_active_dependents (409, see $dependents)
 */
final class ModuleActivationException extends DomainException
{
    /**
     * @param  list<string>  $dependents  Active dependent module keys, when relevant.
     */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 422,
        public readonly array $dependents = [],
    ) {
        parent::__construct($message);
    }
}
