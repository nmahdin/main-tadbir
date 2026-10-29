<?php

namespace App\Core\Identity;

use RuntimeException;

/**
 * Stable email-verification failure codes (Stage C6-2):
 * email_already_claimed, email_verification_invalid,
 * email_verification_expired, email_delivery_unavailable.
 * Stage C6-3 adds email_delivery_failed (a configured real
 * transport attempted delivery and failed; the challenge stands
 * and recovery is requesting a new challenge).
 */
final class EmailVerificationException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
