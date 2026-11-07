<?php

namespace App\Core\Identity;

use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Fail-closed default delivery (Stage C6-2): until a real
 * transport is wired (C6-3/C6-4), requesting a verification
 * challenge fails explicitly instead of pretending an email was
 * sent. No address can become verified through this binding.
 */
final class UnavailableEmailVerificationDelivery implements EmailVerificationDelivery
{
    public function deliver(User $user, string $normalizedEmail, string $rawToken, CarbonImmutable $expiresAt): void
    {
        throw new EmailVerificationException(
            'email_delivery_unavailable',
            'Email delivery is not configured, so email verification is unavailable.',
        );
    }
}
