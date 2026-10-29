<?php

namespace App\Core\Subscriptions;

/**
 * Deterministic subscription lifecycle states (Stage C5-2),
 * derived purely from stored UTC boundaries — never from a
 * scheduled status rewrite:
 *
 *  - NotStarted: before the effective start; no entitlement.
 *  - Active: start inclusive -> expiry exclusive.
 *  - Grace: expiry inclusive -> grace end exclusive (full access
 *    continues during grace; enforcement is C5-3).
 *  - Expired: at/after grace end (previously entitled+enabled
 *    modules may be read-only under C5-3; absent/never-started/
 *    invalid subscriptions never receive that).
 *  - Missing: no subscription; deny.
 *  - Invalid: inconsistent stored boundaries; deny.
 */
enum SubscriptionState: string
{
    case NotStarted = 'not_started';
    case Active = 'active';
    case Grace = 'grace';
    case Expired = 'expired';
    case Missing = 'missing';
    case Invalid = 'invalid';

    public function isFullyEligible(): bool
    {
        return $this === self::Active || $this === self::Grace;
    }
}
