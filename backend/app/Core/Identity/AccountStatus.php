<?php

namespace App\Core\Identity;

/**
 * Canonical account status interpretation (Stage C1).
 *
 * The users.status column historically carries four legacy values
 * (active/inactive/blocked/pending); Core v1 adds `suspended` and
 * `deactivated` (migration 2026_10_15_000004). Existing values keep
 * their exact legacy semantics — nothing is remapped: a pending
 * account is not silently activated and a blocked account is not
 * silently unblocked. Only `active` ever grants operational access;
 * every other status denies at login, middleware, authorization and
 * integration surfaces because they all consult this interpretation
 * (via User::isActive()).
 */
enum AccountStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Blocked = 'blocked';
    case Pending = 'pending';
    case Suspended = 'suspended';
    case Deactivated = 'deactivated';

    public static function of(?string $status): ?self
    {
        return $status === null ? null : self::tryFrom($status);
    }

    /** Only an active account may obtain operational access. */
    public function allowsOperationalAccess(): bool
    {
        return $this === self::Active;
    }

    /** The four pre-C1 values whose semantics must not change. */
    public function isLegacy(): bool
    {
        return match ($this) {
            self::Active, self::Inactive, self::Blocked, self::Pending => true,
            self::Suspended, self::Deactivated => false,
        };
    }

    public function isTerminal(): bool
    {
        return $this === self::Deactivated;
    }
}
