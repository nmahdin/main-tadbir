<?php

namespace App\Core\Plans;

use DomainException;

/**
 * Plan provisioning was rejected. `errorCode` is stable:
 * plan_key_invalid, plan_audience_invalid, plan_drift,
 * plan_status_invalid, plan_version_invalid, plan_version_drift,
 * plan_version_immutable, plan_version_not_found, plan_not_found,
 * unknown_module, unknown_resource_key, limit_invalid.
 */
final class PlanProvisioningException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
