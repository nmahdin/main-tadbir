<?php

namespace App\Core\Authorization;

/**
 * A transient concurrency failure (lock wait timeout, deadlock,
 * database-busy) interrupted an otherwise valid operation (HTTP 503).
 * Retrying is safe; this exception is never a permission grant and
 * must never be converted into an allow decision.
 */
class RetryableAuthorizationException extends AuthorizationException
{
    public function httpStatus(): int
    {
        return 503;
    }
}
