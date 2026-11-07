<?php

namespace App\Core\Identity\Otp;

/**
 * Test/local-development driver. Records the last code in memory only
 * (per-process); it is bound exclusively when an operator explicitly
 * sets AUTH_OTP_DRIVER=fake (intended for local Laragon and CI). It
 * never writes the code to a log file.
 */
final class FakeSmsOtpDelivery implements SmsOtpDelivery
{
    /** @var array<string, string> phone => code (process-local, tests only) */
    public static array $sent = [];

    public function sendOtp(string $e164Phone, string $code, string $purpose): bool
    {
        self::$sent[$e164Phone] = $code;

        return true;
    }

    public function driver(): string
    {
        return 'fake';
    }
}
