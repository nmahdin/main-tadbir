<?php

namespace App\Core\Platform;

use DomainException;

/**
 * The actor lacks platform authority for an operation (mapped to
 * HTTP 403 by future Platform controllers). Distinct from
 * RbacValidationException (422) so "you may not" is never confused
 * with "that request is invalid".
 */
final class PlatformAuthorizationException extends DomainException {}
