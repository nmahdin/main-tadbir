<?php

namespace App\Core\Organizations;

use DomainException;

/**
 * An organization lifecycle transition was rejected. `errorCode`
 * is a stable machine-readable reason:
 *
 *  platform_authority_required, reason_required,
 *  invalid_transition, stale_version
 */
final class OrganizationLifecycleException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
