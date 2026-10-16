<?php

namespace App\Core\Organizations;

use DomainException;

/**
 * A background operation was refused by the organization
 * execution guard (Stage C3-3). `errorCode` is stable:
 * `organization_not_executable` (with the eligibility that caused
 * it, so callers can distinguish pause-and-preserve from
 * terminate-and-drop) or `scope_mismatch` (a job payload claimed
 * a scope that persisted records do not support).
 */
final class OrganizationExecutionDeniedException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        public readonly ?ExecutionEligibility $eligibility,
        string $message,
    ) {
        parent::__construct($message);
    }
}
