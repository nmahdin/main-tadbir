<?php

namespace App\Core\Rbac;

use DomainException;

/**
 * An RBAC operation is invalid regardless of actor authority: unknown
 * permission key, role scope/container mismatch, grant-ceiling
 * violation, protected-role mutation, or a final-manager violation
 * (mapped to HTTP 422 by Core controllers). Unknown permission keys are
 * always rejected explicitly, never silently dropped (ADR-0004).
 */
class RbacValidationException extends DomainException
{
}
