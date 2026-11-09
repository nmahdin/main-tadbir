<?php

namespace App\Core\Memberships;

/**
 * Membership lifecycle (Stage 03A, ADR-0003 corrected by Q-05 ratification
 * in the Stage 03A authorization): active, deactivated, ended.
 *
 * Allowed transitions (enforced by the MembershipLifecycle trait):
 *  - active      -> deactivated | ended
 *  - deactivated -> active (reactivation) | ended
 *  - ended       -> terminal; rejoining creates a NEW membership record
 *                   (the unique live-membership constraint permits this
 *                   because ended rows fall out of the live key).
 */
enum MembershipStatus: string
{
    case Active = 'active';
    case Deactivated = 'deactivated';
    case Ended = 'ended';

    /** @return array<int, self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Active => [self::Deactivated, self::Ended],
            self::Deactivated => [self::Active, self::Ended],
            self::Ended => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }
}
