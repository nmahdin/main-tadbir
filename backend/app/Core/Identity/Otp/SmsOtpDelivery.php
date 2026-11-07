<?php

namespace App\Core\Identity\Otp;

/**
 * AMB-03=A: provider-neutral SMS OTP delivery. Implementations are
 * bound from config (`auth.otp.driver`); credentials and sender ids
 * live in deployment config only. Implementations must never log the
 * raw code. Returning false means "not delivered" — callers fail
 * safely with a localized, actionable error.
 */
interface SmsOtpDelivery
{
    public function sendOtp(string $e164Phone, string $code, string $purpose): bool;

    /** Stable driver key for diagnostics (never contains secrets). */
    public function driver(): string;
}
