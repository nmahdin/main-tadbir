<?php

namespace App\Core\Authorization;

use DomainException;

/**
 * Base type for every central-authorization failure (Stage 04A,
 * ADR-0008). Carries a stable machine-readable reason code alongside
 * the human message so HTTP controllers, console commands, jobs, and
 * integrations can all map the same decision to their own surface
 * without re-deriving it:
 *  - AuthorizationDeniedException          -> 403 (may not)
 *  - InvalidAuthorizationContextException  -> 404 (no such valid
 *    context; also used for records outside the context so direct-ID
 *    probing cannot distinguish foreign records from missing ones)
 *  - RetryableAuthorizationException       -> 503 (transient lock
 *    contention; safe to retry, never a permission grant)
 */
abstract class AuthorizationException extends DomainException
{
    public function __construct(
        private readonly string $reason,
        string $message,
    ) {
        parent::__construct($message);
    }

    public function reason(): string
    {
        return $this->reason;
    }

    abstract public function httpStatus(): int;
}
