<?php

namespace App\Core\Identity;

use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * A freshly issued email-verification challenge (Stage C6-2).
 *
 * The raw token exists only here and at the delivery boundary;
 * storage holds only its SHA-256 hash.
 */
final readonly class IssuedEmailChallenge
{
    public function __construct(
        public User $user,
        public string $normalizedEmail,
        public string $rawToken,
        public CarbonImmutable $expiresAt,
    ) {}
}
