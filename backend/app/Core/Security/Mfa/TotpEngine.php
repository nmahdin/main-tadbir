<?php

namespace App\Core\Security\Mfa;

/**
 * Minimal RFC 6238 / RFC 4226 TOTP verifier using only built-in PHP
 * primitives. Secrets are Base32-encoded (the provisioning URI uses
 * them in that form); verification uses SHA-1, 6-digit codes, and a
 * 30-second period by default. The verifier checks ±1 window for
 * clock skew but refuses replays within the accepted window through
 * the challenge table.
 */
final class TotpEngine
{
    public const PERIOD_SECONDS = 30;

    public const DIGITS = 6;

    public const WINDOW = 1; // ±1 period for clock skew

    public const SECRET_BYTES = 20; // 160-bit key, matches RFC 6238 SHA-1 recommendation

    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(self::SECRET_BYTES));
    }

    public static function provisioningUri(string $secret, string $accountName, string $issuer = 'Tadbir'): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($accountName);
        $params = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD_SECONDS,
        ]);

        return 'otpauth://totp/' . $label . '?' . $params;
    }

    public static function verify(string $secret, string $code, ?int $at = null): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (! preg_match('/^\d{' . self::DIGITS . '}$/', $code)) {
            return false;
        }
        $key = self::base32Decode($secret);
        if ($key === null || strlen($key) < 10) {
            return false;
        }
        $time = (int) floor(($at ?? time()) / self::PERIOD_SECONDS);
        for ($offset = -self::WINDOW; $offset <= self::WINDOW; $offset++) {
            $expected = self::hotp($key, $time + $offset);
            if (hash_equals($expected, $code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return the counter windows that the current code is valid for.
     * Used by the service to record the accepted counter and prevent
     * replay within the same window.
     *
     * @return array<int, int>
     */
    public static function acceptedCounters(?int $at = null): array
    {
        $center = (int) floor(($at ?? time()) / self::PERIOD_SECONDS);

        return range($center - self::WINDOW, $center + self::WINDOW);
    }

    private static function hotp(string $key, int $counter): string
    {
        $counter = pack('N*', 0, $counter); // 64-bit big-endian
        $hash = hash_hmac('sha1', $counter, $key, true);
        $offset = ord($hash[strlen($hash) - 1]) & 0x0F;
        $binary =
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF);
        $otp = $binary % (10 ** self::DIGITS);

        return str_pad((string) $otp, self::DIGITS, '0', STR_PAD_LEFT);
    }

    private static function base32Encode(string $bytes): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $binary = '';
        foreach (str_split($bytes) as $byte) {
            $binary .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($binary, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $out .= $alphabet[bindec($chunk)];
        }
        $pad = strlen($out) % 8;
        if ($pad !== 0) {
            $out .= str_repeat('=', 8 - $pad);
        }

        return $out;
    }

    private static function base32Decode(string $in): ?string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $in = strtoupper(rtrim($in, '='));
        $in = preg_replace('/[^A-Z2-7]/', '', $in);
        if ($in === null || $in === '') {
            return null;
        }
        $binary = '';
        foreach (str_split($in) as $char) {
            $idx = strpos($alphabet, $char);
            if ($idx === false) {
                return null;
            }
            $binary .= str_pad(decbin($idx), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split($binary, 8) as $chunk) {
            if (strlen($chunk) < 8) {
                break;
            }
            $bytes .= chr(bindec($chunk));
        }

        return $bytes;
    }
}
