<?php

namespace App\Core\Platform\Operations;

/**
 * Verifies signed operational request tokens (Stage C2-4).
 *
 * Fails closed on every anomaly: missing server secret, malformed
 * structure, signature mismatch (constant-time comparison), expiry,
 * excessive TTL, unknown operation, missing bindings. The token is
 * bound to operation type, request ID, target username, expiry
 * and — for recovery — incident metadata; changing any of them
 * invalidates the signature.
 */
final class OperationTokenVerifier
{
    public function verify(string $token): VerifiedOperation
    {
        $secret = config('platform.operations.secret');
        if (! is_string($secret) || $secret === '') {
            throw new PlatformOperationException(
                'operations_not_configured',
                'Platform operations secret is not configured; operations fail closed.',
            );
        }

        $parts = explode('.', trim($token));
        if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
            throw new PlatformOperationException('token_malformed', 'Operation token is malformed.');
        }

        [$body, $signature] = $parts;
        $expected = OperationTokenSigner::base64UrlEncode(hash_hmac('sha256', $body, $secret, true));
        if (! hash_equals($expected, $signature)) {
            throw new PlatformOperationException('token_signature_invalid', 'Operation token signature is invalid.');
        }

        $json = OperationTokenSigner::base64UrlDecode($body);
        $payload = $json === null ? null : json_decode($json, true);
        if (! is_array($payload)) {
            throw new PlatformOperationException('token_malformed', 'Operation token payload is malformed.');
        }

        return $this->validate($payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function validate(array $payload): VerifiedOperation
    {
        $operation = $payload['op'] ?? null;
        if (! in_array($operation, ['bootstrap', 'recovery'], true)) {
            throw new PlatformOperationException('token_malformed', 'Unknown operation type.');
        }

        $requestId = $this->stringField($payload, 'request_id', 80);
        $operatorId = $this->stringField($payload, 'operator', 120);
        $target = $this->stringField($payload, 'target_username', 255);
        if ($requestId === null || $operatorId === null || $target === null) {
            throw new PlatformOperationException('token_malformed', 'Operation token is missing required bindings.');
        }

        $issuedAt = $payload['iat'] ?? null;
        $expiresAt = $payload['exp'] ?? null;
        if (! is_int($issuedAt) || ! is_int($expiresAt)) {
            throw new PlatformOperationException('token_malformed', 'Operation token lacks validity timestamps.');
        }

        $maxTtl = (int) config('platform.operations.max_ttl_seconds', 3600);
        if ($expiresAt - $issuedAt > max($maxTtl, 60)) {
            throw new PlatformOperationException('token_expired', 'Operation token validity window exceeds the configured maximum.');
        }
        if ($issuedAt > time() + 300) {
            throw new PlatformOperationException('token_malformed', 'Operation token was issued in the future.');
        }
        if ($expiresAt < time()) {
            throw new PlatformOperationException('token_expired', 'Operation token has expired.');
        }

        $incident = is_array($payload['incident'] ?? null) ? $payload['incident'] : [];
        $evidence = [];
        if (is_array($incident['evidence'] ?? null)) {
            $evidence = collect($incident['evidence'])
                ->filter(fn ($item): bool => is_string($item) && $item !== '')
                ->values()
                ->all();
        }
        $verification = is_array($incident['verification'] ?? null) ? $incident['verification'] : [];

        return new VerifiedOperation(
            operation: $operation,
            requestId: $requestId,
            operatorId: $operatorId,
            targetUsername: $target,
            incidentId: $this->stringField($incident, 'id', 120),
            incidentReason: $this->stringField($incident, 'reason', 1000),
            evidenceReferences: $evidence,
            verificationMethod: $this->stringField($verification, 'method', 120),
            verificationReference: $this->stringField($verification, 'reference', 255),
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function stringField(array $payload, string $key, int $maxLength): ?string
    {
        $value = $payload[$key] ?? null;

        return is_string($value) && $value !== '' && strlen($value) <= $maxLength ? $value : null;
    }
}
