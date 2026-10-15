<?php

namespace App\Core\Authorization;

/**
 * Outcome of one higher-level gate (module availability, organization
 * policy, subscription entitlement). Three states exist so that "not
 * implemented yet" is never confused with "allowed":
 *  - allowed:     the gate affirmatively permits;
 *  - denied:      the gate affirmatively refuses (reason given);
 *  - unavailable: the gate is not implemented; the central service
 *                 fails closed on this, exactly like a denial.
 */
final readonly class GateDecision
{
    public const ALLOWED = 'allowed';

    public const DENIED = 'denied';

    public const UNAVAILABLE = 'unavailable';

    private function __construct(
        public string $status,
        public ?string $reason = null,
    ) {
    }

    public static function allow(): self
    {
        return new self(self::ALLOWED);
    }

    public static function deny(string $reason): self
    {
        return new self(self::DENIED, $reason);
    }

    public static function unavailable(string $reason): self
    {
        return new self(self::UNAVAILABLE, $reason);
    }

    public function isAllowed(): bool
    {
        return $this->status === self::ALLOWED;
    }

    public function isUnavailable(): bool
    {
        return $this->status === self::UNAVAILABLE;
    }
}
