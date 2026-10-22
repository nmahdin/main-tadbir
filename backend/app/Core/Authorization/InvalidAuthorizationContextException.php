<?php

namespace App\Core\Authorization;

/**
 * The workspace identifier is invalid or no such workspace exists, or
 * a record does not belong to the resolved context (HTTP 404; foreign
 * and nonexistent records are intentionally indistinguishable).
 */
class InvalidAuthorizationContextException extends AuthorizationException
{
    public function httpStatus(): int
    {
        return 404;
    }
}
