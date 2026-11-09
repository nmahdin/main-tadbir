<?php

namespace App\Core\Subscriptions;

use Carbon\CarbonImmutable;

/**
 * Deterministic subscription lifecycle evaluation (Stage C5-2).
 *
 * Pure function of the stored UTC boundaries and the evaluation
 * instant (default: now; injectable for tests) — deliberately NOT
 * driven by any scheduled status rewrite. Boundary semantics are
 * exact: start inclusive, expiry and grace-end exclusive.
 * Inconsistent stored state fails closed as Invalid.
 */
final class SubscriptionLifecycle
{
    public function evaluate(?CoreSubscription $subscription, ?CarbonImmutable $now = null): SubscriptionState
    {
        if ($subscription === null) {
            return SubscriptionState::Missing;
        }

        $now ??= CarbonImmutable::now('UTC');
        $starts = CarbonImmutable::instance($subscription->starts_at);
        $expires = CarbonImmutable::instance($subscription->expires_at);
        $graceEnds = CarbonImmutable::instance($subscription->grace_ends_at);

        if ($expires->lte($starts) || $graceEnds->lt($expires)) {
            return SubscriptionState::Invalid;
        }

        return match (true) {
            $now->lt($starts) => SubscriptionState::NotStarted,
            $now->lt($expires) => SubscriptionState::Active,
            $now->lt($graceEnds) => SubscriptionState::Grace,
            default => SubscriptionState::Expired,
        };
    }
}
