<?php

namespace App\Core\Identity;

/**
 * Iranian mobile normalization to E.164 (+98…). Used by every phone
 * verification path so legacy values and new requests compare equal
 * (AMB-06). Returns null when the input cannot be an Iranian mobile.
 */
final class PhoneNumber
{
    public static function normalize(string $raw): ?string
    {
        $digits = preg_replace('/[\s\-()]+/', '', trim($raw));
        if ($digits === null || $digits === '') {
            return null;
        }
        if (str_starts_with($digits, '+98')) {
            $digits = substr($digits, 3);
        } elseif (str_starts_with($digits, '0098')) {
            $digits = substr($digits, 4);
        } elseif (str_starts_with($digits, '98') && strlen($digits) === 12) {
            $digits = substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }

        return preg_match('/^9\d{9}$/', $digits) === 1 ? '+98'.$digits : null;
    }

    /** Masked form safe for logs/responses: +9891••••••89 style. */
    public static function mask(?string $e164): string
    {
        if ($e164 === null || strlen($e164) < 7) {
            return '—';
        }

        return substr($e164, 0, 6).'••••'.substr($e164, -2);
    }
}
