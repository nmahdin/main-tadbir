<?php

namespace App\Core\Rbac;

use DomainException;

/**
 * The actor lacks the scoped authority for an RBAC operation (mapped to
 * HTTP 403 by Core controllers). Distinct from RbacValidationException
 * so "you may not" is never confused with "that request is invalid".
 */
class RbacAuthorizationException extends DomainException {}
