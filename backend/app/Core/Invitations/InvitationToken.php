<?php

namespace App\Core\Invitations;

/**
 * Single-use invitation token primitives (Stage C6-1).
 *
 * Raw tokens carry 256 bits of entropy from the operating
 * system's CSPRNG and are URL-safe (base64url, no padding). Only
 * the deterministic SHA-256 hash is persisted (`token_hash`), so
 * lookup is an exact indexed equality on the hash — there is no
 * plaintext token anywhere in storage, logs, or audit, and no
 * secret-dependent comparison to make constant-time beyond the
 * hash lookup itself (knowing the hash grants nothing: acceptance
 * will require the raw token, whose hash must match).
 */
final class InvitationToken
{
    public static function generate(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function hash(string $rawToken): string
    {
        return hash('sha256', $rawToken);
    }
}
