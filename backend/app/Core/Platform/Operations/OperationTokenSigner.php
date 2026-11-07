<?php

namespace App\Core\Platform\Operations;

/**
 * Signs operational request payloads (Stage C2-4).
 *
 * Token format: base64url(json) . "." . base64url(HMAC-SHA256).
 * The signing key is the infrastructure operator's shared secret
 * (config `platform.operations.secret`), held outside the
 * application database and never committed. Signing happens
 * wherever the operator runs `platform:operations:issue`; the
 * application server only ever verifies.
 */
final class OperationTokenSigner
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public static function sign(array $payload, string $secret): string
    {
        $body = self::base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR));
        $signature = self::base64UrlEncode(hash_hmac('sha256', $body, $secret, true));

        return $body.'.'.$signature;
    }

    public static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
