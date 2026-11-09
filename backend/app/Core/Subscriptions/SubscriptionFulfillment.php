<?php

namespace App\Core\Subscriptions;

use App\Core\Audit\AuditWriter;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\CoreBillingQuote;
use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * C5-M4 — authoritative subscription fulfillment (M4-A), renewal
 * and plan transitions (M4-B), and grace/expiry (M4-C).
 *
 * Lock order (consistent with SubscriptionService):
 *   owner row (org|workspace) FOR UPDATE
 *     → core_subscriptions FOR UPDATE
 *     → pending_change FOR UPDATE (if present)
 *     → periods / promo_reservations only as INSERT/state UPDATE.
 *
 * Every mutation writes an immutable SubscriptionPeriod row with a
 * unique correlation_id; replays look up by correlation and
 * return the existing subscription without mutating.
 */
final class SubscriptionFulfillment
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly SubscriptionOwnerResolver $owners,
        private readonly PlanProvisioner $plans,
        private readonly SubscriptionLifecycle $lifecycle,
    ) {
    }

    /**
     * Fulfill an outbox event. Called from PaymentService::dispatchOutbox
     * inside its transaction.
     */
    public function fulfillPaid(CoreBillingFulfillmentOutbox $event, ?CarbonImmutable $at = null): CoreSubscription
    {
        $at ??= CarbonImmutable::now('UTC');
        $payload = (array) $event->payload;
        $ownerType = str_starts_with((string) $event->owner_key, 'org:') ? 'organization' : 'personal';
        $owner = $ownerType === 'organization'
            ? Organization::query()->findOrFail((int) $payload['organization_id'])
            : Workspace::query()->findOrFail((int) $payload['personal_workspace_id']);
        $order = CoreBillingOrder::query()->findOrFail((int) $payload['order_id']);
        $payment = CoreBillingPayment::query()->findOrFail((int) $payload['payment_id']);
        $period = (string) $payload['period'];
        $quote = CoreBillingQuote::query()->findOrFail((int) $payload['quote_id']);
        $targetVersion = CorePlanVersion::query()->findOrFail((int) $quote->plan_version_id);
        $termDays = $this->termDaysFor($period);
        $graceDays = (int) $targetVersion->grace_days > 0 ? (int) $targetVersion->grace_days : (int) config('billing.terms.grace_days', 7);
        $correlationId = (string) $event->event_id;

        return DB::transaction(function () use ($at, $ownerType, $owner, $order, $payment, $period, $targetVersion, $termDays, $graceDays, $correlationId): CoreSubscription {
            $this->lockOwner($ownerType, $owner);
            $subscription = $this->findByOwner($ownerType, $owner, lock: true);
            $actor = $payment->createdBy;
            $existingPeriod = $subscription !== null
                ? $subscription->periods()->where('correlation_id', $correlationId)->first()
                : null;
            if ($existingPeriod !== null) {
                return $subscription; // idempotent replay
            }
            if ($subscription !== null && $subscription->periods()->where('paid_by_payment_id', (int) $payment->id)->exists()) {
                return $subscription;
            }

            // Determine the new period window based on current state.
            $now = $at;
            if ($subscription === null) {
                // M4-A: new paid activation (no prior subscription).
                $startsAt = $now;
                $expiresAt = $startsAt->addDays($termDays);
                $graceEndsAt = $expiresAt->addDays($graceDays);
                $operation = SubscriptionPeriod::OPERATION_PAID_ACTIVATION;
                $subscription = CoreSubscription::create([
                    'organization_id' => $ownerType === 'organization' ? (int) $owner->id : null,
                    'personal_workspace_id' => $ownerType === 'personal' ? (int) $owner->id : null,
                    'plan_version_id' => (int) $targetVersion->id,
                    'starts_at' => $startsAt,
                    'expires_at' => $expiresAt,
                    'grace_ends_at' => $graceEndsAt,
                    'status_version' => 1,
                    'created_by_user_id' => $actor?->id,
                    'updated_by_user_id' => $actor?->id,
                ]);
            } else {
                $state = $this->lifecycle->evaluate($subscription, $now);
                $currentVersionId = (int) $subscription->plan_version_id;
                $currentExpires = CarbonImmutable::instance($subscription->expires_at);
                // Check pending downgrade scheduled for now — apply before determining next window.
                $pending = $this->consumeDuePendingChange($subscription, $now);
                $currentVersionId = $pending['effective_version_id'] ?? $currentVersionId;
                $targetVersionForPeriod = $targetVersion;

                if ($state === SubscriptionState::Active || $state === SubscriptionState::Grace) {
                    // Existing paid subscription:
                    //  - Same version (same plan+period) → renewal stack.
                    //  - Different version AND the purchased term starts
                    //    immediately (UPGRADE) per policy: no proration,
                    //    prior audit kept intact.
                    $isUpgrade = $currentVersionId !== (int) $targetVersion->id;
                    if ($isUpgrade) {
                        $startsAt = $now;
                        $expiresAt = $startsAt->addDays($termDays);
                        $graceEndsAt = $expiresAt->addDays($graceDays);
                        $operation = SubscriptionPeriod::OPERATION_UPGRADE;
                    } else {
                        // Manual renewal: stack next term from existing expiry.
                        $startsAt = $currentExpires;
                        $expiresAt = $startsAt->addDays($termDays);
                        $graceEndsAt = $expiresAt->addDays($graceDays);
                        $operation = SubscriptionPeriod::OPERATION_PAID_RENEWAL;
                    }
                } elseif ($state === SubscriptionState::Expired || $state === SubscriptionState::NotStarted) {
                    // Reactivation after expiry/grace.
                    $startsAt = $now;
                    $expiresAt = $startsAt->addDays($termDays);
                    $graceEndsAt = $expiresAt->addDays($graceDays);
                    $operation = $state === SubscriptionState::NotStarted ? SubscriptionPeriod::OPERATION_PAID_ACTIVATION : SubscriptionPeriod::OPERATION_PAID_RENEWAL;
                } else {
                    $startsAt = $now;
                    $expiresAt = $startsAt->addDays($termDays);
                    $graceEndsAt = $expiresAt->addDays($graceDays);
                    $operation = SubscriptionPeriod::OPERATION_PAID_RENEWAL;
                }

                $subscription->forceFill([
                    'plan_version_id' => (int) $targetVersionForPeriod->id,
                    'starts_at' => $startsAt,
                    'expires_at' => $expiresAt,
                    'grace_ends_at' => $graceEndsAt,
                    'status_version' => (int) $subscription->status_version + 1,
                    'updated_by_user_id' => $actor?->id,
                ])->save();

                // Cancel any other pending changes that conflict (a
                // paid upgrade or renewal supersedes prior future
                // downgrades for the same owner).
                DB::table('core_subscription_pending_changes')
                    ->where('owner_key', $subscription->ownerKey())
                    ->whereNull('applied_at')
                    ->whereNull('cancelled_at')
                    ->where('id', '!=', $pending['pending_id'] ?? 0)
                    ->update(['cancelled_at' => $at->toDateTimeString()]);
            }

            $this->recordPeriod($subscription, $operation, $targetVersion, $startsAt, $expiresAt, $graceEndsAt,
                "Paid {$operation} for order #{$order->id}", $correlationId, $actor?->id, (int) $payment->id);

            $this->audit->record($actor, 'subscription.paid_fulfilled', [
                'subscription_id' => (int) $subscription->id,
                'payment_id' => (int) $payment->id,
                'order_id' => (int) $order->id,
                'operation' => $operation,
                'period' => $period,
                'starts_at' => $startsAt->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'grace_ends_at' => $graceEndsAt->toIso8601String(),
                'correlation_id' => $correlationId,
            ], $ownerType, (int) $owner->id, 'subscription', (int) $subscription->id);

            return $subscription;
        });
    }

    /**
     * Schedule a downgrade (future-effective plan change at end of current term).
     * Called from the plan-change confirmation endpoint after a downgrade order is paid.
     */
    public function scheduleDowngrade(
        User $actor,
        CoreSubscription $subscription,
        CorePlanVersion $targetVersion,
        CoreBillingOrder $order,
        CoreBillingPayment $payment,
        string $correlationId,
        ?CarbonImmutable $at = null,
    ): SubscriptionPendingChange {
        $at ??= CarbonImmutable::now('UTC');

        return DB::transaction(function () use ($actor, $subscription, $targetVersion, $order, $payment, $correlationId, $at): SubscriptionPendingChange {
            $ownerType = $subscription->isOrganizationOwned() ? 'organization' : 'personal';
            $this->lockOwner($ownerType, $this->ownerOf($subscription));
            $locked = CoreSubscription::query()->lockForUpdate()->findOrFail($subscription->id);
            $existing = SubscriptionPendingChange::query()->where('owner_key', $locked->ownerKey())->first();
            if ($existing !== null && $existing->cancelled_at === null && $existing->applied_at === null) {
                if ((int) $existing->target_plan_version_id === (int) $targetVersion->id) {
                    return $existing; // idempotent
                }
                $existing->forceFill(['cancelled_at' => $at])->save();
            }
            $effectiveAt = CarbonImmutable::instance($locked->expires_at);
            $pending = SubscriptionPendingChange::create([
                'owner_key' => $locked->ownerKey(),
                'subscription_id' => (int) $locked->id,
                'order_id' => (int) $order->id,
                'payment_id' => (int) $payment->id,
                'target_plan_version_id' => (int) $targetVersion->id,
                'reason' => SubscriptionPendingChange::REASON_DOWNGRADE,
                'correlation_id' => $correlationId,
                'effective_at' => $effectiveAt,
                'requested_by_user_id' => $actor->id,
                'created_at' => $at,
            ]);
            $this->audit->record($actor, 'subscription.downgrade_scheduled', [
                'subscription_id' => (int) $locked->id,
                'pending_change_id' => (int) $pending->id,
                'target_plan_version_id' => (int) $targetVersion->id,
                'effective_at' => $effectiveAt->toIso8601String(),
                'correlation_id' => $correlationId,
            ], $ownerType, $this->scopeId($locked), 'subscription', (int) $locked->id);

            return $pending;
        });
    }

    /**
     * Idempotent sweeper: apply due pending changes, process grace
     * expiry to Free (when eligible). Returns counts of processed items.
     */
    public function sweep(?CarbonImmutable $at = null): array
    {
        $at ??= CarbonImmutable::now('UTC');
        $applied = 0;
        $expiredToFree = 0;

        // Apply pending downgrades due.
        $due = SubscriptionPendingChange::query()
            ->whereNull('applied_at')
            ->whereNull('cancelled_at')
            ->where('effective_at', '<=', $at)
            ->limit(100)
            ->get();
        foreach ($due as $change) {
            if ($this->applyPendingChange($change, $at)) {
                $applied++;
            }
        }

        // Grace → Free transition. A subscription past grace_ends_at
        // that has the Free plan already set, or can be safely
        // transitioned to its owner-typed Free plan, moves to the
        // published Free plan version. Over-quota data is preserved;
        // existing guards block only new allocations beyond Free quota.
        foreach ($this->findExpiredSubscriptions($at, 100) as $sub) {
            if ($this->transitionExpiredToFree($sub, $at)) {
                $expiredToFree++;
            }
        }

        return ['pending_changes_applied' => $applied, 'expired_to_free' => $expiredToFree];
    }

    // ---- internals ----

    private function applyPendingChange(SubscriptionPendingChange $change, CarbonImmutable $at): bool
    {
        return DB::transaction(function () use ($change, $at): bool {
            $locked = SubscriptionPendingChange::query()->lockForUpdate()->find($change->id);
            if ($locked === null || $locked->applied_at !== null || $locked->cancelled_at !== null) {
                return false;
            }
            $subscription = CoreSubscription::query()->lockForUpdate()->find($locked->subscription_id);
            if ($subscription === null) {
                $locked->forceFill(['cancelled_at' => $at])->save();
                return false;
            }
            // Only apply at or after effective_at; only if the subscription is
            // still on the expected pre-change plan (paid lifecycle already
            // ran). If already on target, mark applied idempotently.
            if ($at->lt(CarbonImmutable::instance($locked->effective_at))) {
                return false;
            }
            if ((int) $subscription->plan_version_id !== (int) $locked->target_plan_version_id) {
                $targetVersion = CorePlanVersion::query()->findOrFail($locked->target_plan_version_id);
                $subscription->forceFill([
                    'plan_version_id' => (int) $targetVersion->id,
                    'grace_ends_at' => CarbonImmutable::instance($subscription->expires_at)->addDays((int) $targetVersion->grace_days ?: (int) config('billing.terms.grace_days', 7)),
                    'status_version' => (int) $subscription->status_version + 1,
                    'updated_by_user_id' => $locked->requested_by_user_id,
                ])->save();
                $this->recordPeriod($subscription, SubscriptionPeriod::OPERATION_DOWNGRADE, $targetVersion,
                    CarbonImmutable::instance($subscription->starts_at), CarbonImmutable::instance($subscription->expires_at),
                    CarbonImmutable::instance($subscription->grace_ends_at),
                    'Scheduled downgrade applied (end of term)',
                    'downgrade:'.$locked->correlation_id, $locked->requested_by_user_id, $locked->payment_id);
            }
            $locked->forceFill(['applied_at' => $at])->save();

            return true;
        });
    }

    private function findExpiredSubscriptions(CarbonImmutable $at, int $limit): iterable
    {
        return CoreSubscription::query()
            ->where('grace_ends_at', '<=', $at)
            ->whereNotNull('grace_ends_at')
            ->limit($limit)
            ->lockForUpdate()
            ->get();
    }

    private function transitionExpiredToFree(CoreSubscription $sub, CarbonImmutable $at): bool
    {
        return DB::transaction(function () use ($sub, $at): bool {
            $locked = CoreSubscription::query()->lockForUpdate()->find($sub->id);
            if ($locked === null) {
                return false;
            }
            $state = $this->lifecycle->evaluate($locked, $at);
            if ($state !== SubscriptionState::Expired) {
                return false;
            }
            $ownerType = $locked->isOrganizationOwned() ? 'organization' : 'personal';
            $freeKey = $ownerType === 'organization'
                ? (string) config('billing.free.organization_plan_key', 'organization-free')
                : (string) config('billing.free.personal_plan_key', 'personal-free');
            $freeVersionNumber = $ownerType === 'organization'
                ? (int) config('billing.free.organization_plan_version', 1)
                : (int) config('billing.free.personal_plan_version', 1);
            $plan = CorePlan::query()->where('key', $freeKey)->first();
            if ($plan === null) {
                return false;
            }
            $audience = $ownerType === 'organization' ? CorePlan::AUDIENCE_ORGANIZATION : CorePlan::AUDIENCE_PERSONAL;
            if ($plan->audience !== $audience) {
                return false;
            }
            $freeVersion = $plan->versions()->where('version', $freeVersionNumber)->first();
            if ($freeVersion === null || !$freeVersion->isPublished()) {
                return false;
            }
            if ((int) $locked->plan_version_id === (int) $freeVersion->id) {
                return false; // already on Free
            }
            $freeStarts = CarbonImmutable::now('UTC');
            $freeExpires = $freeStarts->addYears(100);
            $freeGrace = $freeExpires->addDays((int) $freeVersion->grace_days ?: 7);
            $locked->forceFill([
                'plan_version_id' => (int) $freeVersion->id,
                'starts_at' => $freeStarts,
                'expires_at' => $freeExpires,
                'grace_ends_at' => $freeGrace,
                'status_version' => (int) $locked->status_version + 1,
            ])->save();
            $this->recordPeriod($locked, SubscriptionPeriod::OPERATION_GRACE_EXPIRY_FREE, $freeVersion,
                $freeStarts, $freeExpires, $freeGrace,
                'Grace expired — transitioned to Free plan (data preserved).',
                'grace_expiry_free:'.$locked->id.':'.$at->getTimestamp(), null, null);
            $this->audit->record(null, 'subscription.grace_expired_to_free', [
                'subscription_id' => (int) $locked->id,
                'free_plan_version_id' => (int) $freeVersion->id,
            ], $ownerType, $this->scopeId($locked), 'subscription', (int) $locked->id);

            return true;
        });
    }

    private function consumeDuePendingChange(CoreSubscription $subscription, CarbonImmutable $at): array
    {
        $pending = SubscriptionPendingChange::query()
            ->where('owner_key', $subscription->ownerKey())
            ->whereNull('cancelled_at')
            ->whereNull('applied_at')
            ->where('effective_at', '<=', $at)
            ->lockForUpdate()
            ->first();
        if ($pending === null) {
            return [];
        }

        return [
            'pending_id' => (int) $pending->id,
            'effective_version_id' => (int) $pending->target_plan_version_id,
        ];
    }

    private function lockOwner(string $ownerType, Organization|Workspace $owner): void
    {
        if ($ownerType === 'organization') {
            DB::table('organizations')->whereKey($owner->id)->lockForUpdate()->first();
        } else {
            DB::table('workspaces')->whereKey($owner->id)->lockForUpdate()->first();
        }
    }

    private function findByOwner(string $ownerType, Organization|Workspace $owner, bool $lock): ?CoreSubscription
    {
        $q = CoreSubscription::query();
        if ($ownerType === 'organization') {
            $q->where('organization_id', $owner->id);
        } else {
            $q->where('personal_workspace_id', $owner->id);
        }
        if ($lock) {
            $q->lockForUpdate();
        }

        return $q->first();
    }

    private function ownerOf(CoreSubscription $subscription): Organization|Workspace
    {
        if ($subscription->organization_id !== null) {
            return Organization::query()->findOrFail($subscription->organization_id);
        }

        return Workspace::query()->findOrFail($subscription->personal_workspace_id);
    }

    private function scopeId(CoreSubscription $sub): int
    {
        return (int) ($sub->organization_id ?? $sub->personal_workspace_id ?? 0);
    }

    private function termDaysFor(string $period): int
    {
        return match ($period) {
            'quarterly' => (int) config('billing.terms.quarterly_days', 90),
            'annual' => (int) config('billing.terms.annual_days', 365),
            default => (int) config('billing.terms.monthly_days', 30),
        };
    }

    private function recordPeriod(
        CoreSubscription $subscription,
        string $operation,
        CorePlanVersion $version,
        CarbonInterface $startsAt,
        CarbonInterface $expiresAt,
        CarbonInterface $graceEndsAt,
        string $reason,
        string $correlationId,
        ?int $actorUserId,
        ?int $paymentId,
    ): void {
        $startsAt = CarbonImmutable::instance($startsAt);
        $expiresAt = CarbonImmutable::instance($expiresAt);
        $graceEndsAt = CarbonImmutable::instance($graceEndsAt);
        DB::table('core_subscription_periods')->insert([
            'subscription_id' => (int) $subscription->id,
            'plan_version_id' => (int) $version->id,
            'operation' => $operation,
            'effective_starts_at' => $startsAt->toDateTimeString(),
            'expires_at' => $expiresAt->toDateTimeString(),
            'grace_ends_at' => $graceEndsAt->toDateTimeString(),
            'reason' => $reason,
            'correlation_id' => $correlationId,
            'paid_by_payment_id' => $paymentId,
            'created_by_user_id' => $actorUserId,
            'created_at' => CarbonImmutable::now('UTC')->toDateTimeString(),
            'updated_at' => CarbonImmutable::now('UTC')->toDateTimeString(),
        ]);
    }
}
