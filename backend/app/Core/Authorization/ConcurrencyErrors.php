<?php

namespace App\Core\Authorization;

use Throwable;

/**
 * Classifies database concurrency failures so every caller treats
 * them consistently (Stage 04A requirement: retryable errors are a
 * distinct outcome from denial). Covers MySQL/InnoDB lock-wait
 * timeout (1205) and deadlock (1213), serialization failures (40001),
 * and SQLite busy errors. Anything else is not retryable here.
 */
final class ConcurrencyErrors
{
    public static function isRetryable(Throwable $exception): bool
    {
        $message = $exception->getMessage();

        foreach (['1205', '1213', '40001', 'lock wait timeout', 'deadlock', 'database is locked', 'database table is locked'] as $needle) {
            if (stripos($message, $needle) !== false) {
                return true;
            }
        }

        return false;
    }

    public static function wrap(Throwable $exception): RetryableAuthorizationException
    {
        return new RetryableAuthorizationException(
            'concurrency_retryable',
            'The operation conflicted with a concurrent update and can be retried.',
        );
    }
}
