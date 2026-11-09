<?php

namespace App\Core\Subscriptions;

use App\Core\Plans\PlanVersionSnapshot;

/**
 * The evaluation-ready subscription view for one workspace
 * (Stage C5-2): lifecycle state plus the last valid published
 * plan-version snapshot. The plan snapshot is preserved after
 * expiry so C5-3 can determine which previously entitled module
 * reads remain eligible; Missing/NotStarted/Invalid snapshots
 * carry no entitlement and must never receive read-only access.
 */
final readonly class SubscriptionSnapshot
{
    public function __construct(
        public SubscriptionState $state,
        public SubscriptionOwner $owner,
        public ?int $subscriptionId,
        public ?PlanVersionSnapshot $plan,
        public ?string $startsAt,
        public ?string $expiresAt,
        public ?string $graceEndsAt,
    ) {}

    public function isFullyEligible(): bool
    {
        return $this->state->isFullyEligible();
    }
}
