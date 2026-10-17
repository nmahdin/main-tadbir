<?php

namespace App\Core\Subscriptions;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\ModuleCatalog;
use App\Core\Plans\Contracts\SubscriptionAccessEvaluator;
use App\Core\Plans\ModuleAccessLevel;
use App\Core\Workspaces\Workspace;
use Carbon\CarbonImmutable;

/**
 * Production subscription entitlement evaluation (Stage C5-3).
 *
 * One evaluator behind both contracts:
 *  - SubscriptionAccessEvaluator (runtime read/write levels), and
 *  - the C4 ModuleEntitlementGate, whose semantics here are
 *    ACTIVATION eligibility (canActivate) — the planner/service
 *    only ask it about modules that would be newly enabled.
 *
 * Decisions (fail-closed throughout; ownership resolved strictly
 * from the persisted workspace row via SubscriptionService):
 *  - Active + plan entitles module  -> Full
 *  - Grace + plan entitles module   -> Grace
 *  - Expired + plan entitled module under the last effective
 *    published version + evidence of a genuinely commenced, valid
 *    period history -> ReadOnly
 *  - Missing / NotStarted / Invalid / unentitled / unknown or
 *    technically unavailable module / ambiguous ownership /
 *    inconsistent period history -> Denied
 *
 * An expired row alone never earns ReadOnly: there must be at
 * least one recorded period, the latest period must belong to the
 * currently assigned plan version, every period window must be
 * consistent, and a period must actually have commenced. Workspace
 * activation state and historical activation are NOT consulted
 * here — they remain the C4 guard's concern (this evaluator never
 * invents activation that does not exist).
 *
 * Organization lifecycle is not re-decided here: suspended/ended
 * organizations are denied earlier by workspace context resolution
 * (C3), which always outranks subscription outcomes.
 */
final class SubscriptionEntitlementEvaluator implements ModuleEntitlementGate, SubscriptionAccessEvaluator
{
    public function __construct(
        private readonly SubscriptionService $subscriptions,
    ) {}

    public function isEntitled(Workspace $workspace, string $moduleKey): bool
    {
        return $this->canActivate($workspace, $moduleKey);
    }

    public function canActivate(Workspace $workspace, string $moduleKey): bool
    {
        $level = $this->accessLevel($workspace, $moduleKey);

        return $level === ModuleAccessLevel::Full || $level === ModuleAccessLevel::Grace;
    }

    public function accessLevel(Workspace $workspace, string $moduleKey): ModuleAccessLevel
    {
        $definition = ModuleCatalog::get($moduleKey);

        if ($definition === null || ! $definition->isAvailable()) {
            return ModuleAccessLevel::Denied;
        }

        try {
            $snapshot = $this->subscriptions->snapshotForWorkspace($workspace);
        } catch (SubscriptionException) {
            return ModuleAccessLevel::Denied; // ambiguous/corrupt ownership fails closed
        }

        if ($snapshot->plan === null || ! $snapshot->plan->allowsModule($moduleKey)) {
            return ModuleAccessLevel::Denied;
        }

        return match ($snapshot->state) {
            SubscriptionState::Active => ModuleAccessLevel::Full,
            SubscriptionState::Grace => ModuleAccessLevel::Grace,
            SubscriptionState::Expired => $this->hasCommencedValidHistory($snapshot)
                ? ModuleAccessLevel::ReadOnly
                : ModuleAccessLevel::Denied,
            default => ModuleAccessLevel::Denied,
        };
    }

    /**
     * ReadOnly requires evidence, not merely an expired row: a
     * recorded period history whose windows are consistent, whose
     * latest period matches the assigned plan version, and at
     * least one period that genuinely commenced.
     */
    private function hasCommencedValidHistory(SubscriptionSnapshot $snapshot): bool
    {
        if ($snapshot->subscriptionId === null) {
            return false;
        }

        $subscription = CoreSubscription::query()->find($snapshot->subscriptionId);

        if ($subscription === null) {
            return false;
        }

        $periods = $subscription->periods()->orderBy('id')->get();

        if ($periods->isEmpty()) {
            return false;
        }

        $now = CarbonImmutable::now('UTC');
        $commenced = false;

        foreach ($periods as $period) {
            $start = CarbonImmutable::instance($period->effective_starts_at);
            $expiry = CarbonImmutable::instance($period->expires_at);
            $graceEnd = CarbonImmutable::instance($period->grace_ends_at);

            if ($expiry->lte($start) || $graceEnd->lt($expiry)) {
                return false; // inconsistent recorded history
            }

            if ($start->lte($now)) {
                $commenced = true;
            }
        }

        $latest = $periods->last();

        return $commenced && (int) $latest->plan_version_id === (int) $subscription->plan_version_id;
    }
}
