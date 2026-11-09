<?php

namespace App\Core\Identity;

use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Delivery port for email-verification challenges (Stage C6-2).
 *
 * The raw challenge token may cross this boundary ONLY: delivery
 * is the trusted channel to the account holder's mailbox (the
 * C6-3/C6-4 packages own wiring a real transport — SMTP/API —
 * behind this contract; C10 owns any broader notification
 * framework). No production transport exists yet, so the default
 * container binding is UnavailableEmailVerificationDelivery,
 * which fails closed: no address can be verified until a real
 * delivery channel is configured. Tests bind a capturing
 * implementation to exercise the genuine service flow end to end.
 */
interface EmailVerificationDelivery
{
    /**
     * @throws EmailVerificationException email_delivery_unavailable when no transport is configured
     */
    public function deliver(User $user, string $normalizedEmail, string $rawToken, CarbonImmutable $expiresAt): void;
}
