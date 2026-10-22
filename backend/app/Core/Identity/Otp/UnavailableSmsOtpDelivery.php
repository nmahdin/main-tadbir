<?php

namespace App\Core\Identity\Otp;

/**
 * Default when no verified production provider is configured: OTP is
 * reported as unavailable instead of pretending a code was sent.
 */
final class UnavailableSmsOtpDelivery implements SmsOtpDelivery
{
    public function sendOtp(string $e164Phone, string $code, string $purpose): bool
    {
        return false;
    }

    public function driver(): string
    {
        return 'unavailable';
    }
}
