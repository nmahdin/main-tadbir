<?php

namespace App\Core\Subscriptions;

use App\Core\Audit\AuditWriter;
use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformAuthorizer;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Manual subscription provisioning and renewal (Stage C5-2, MVP:
 * platform-administrator operated, no payment integration).
 *
 * Authorization: the actor must effectively hold
 * `platform.subscriptions.manage` through persisted platform role
 * assignments (PlatformAuthorizer). Organization owners, Legacy
 * Admin, workspace managers, and Primary-status alone obtain
 * nothing implicitly.
 *
 * Lock order (documented): owner row (organization or workspace,
 * FOR UPDATE) -> subscription row (FOR UPDATE). Authorization is
 * checked before the transaction and the mutation re-reads state
 * under the locks; `status_version` provides the optimistic check.
 * Every mutation requires a reason, records an immutable period,
 * and writes the C1 audit entry in the same transaction — a failed
 * audit rolls everything back. Correlation identifiers make
 * retries idempotent: a repeated correlation returns the recorded
 * outcome instead of applying twice.
 *
 * Renewal rule (deterministic): while the current period is active
 * (or scheduled), the new period extends from the current
 * expiration boundary; during grace or after expiry the operator
 * must supply an explicit new start that is not in the past and
 * does not overlap the previous paid window — past entitlement is
 * never fabricated. Plan changes are unsupported here (C5-4 owns
 * plan-change preview/confirmation), so renewal always keeps the
 * assigned published plan version.
 *
 * This service never enables modules, grants RBAC permissions,
 * deletes data, or creates subscriptions implicitly.
 */
final class SubscriptionService
{
    public const PERMISSION = 'platform.subscriptions.manage';

    public function __construct(
        private readonly PlatformAuthorizer $platformAuthorizer,
        private readonly AuditWriter $audit,
        private readonly SubscriptionOwnerResolver $owners,
        private readonly SubscriptionLifecycle $lifecycle,
        private readonly PlanProvisioner $plans,
        private readonly PlanChangePlanner $planChanges,
    ) {}

    public function assignInitial(
        User $actor,
        Organization|Workspace $owner,
        string $planKey,
        int $planVersion,
        CarbonImmutable $startsAt,
        CarbonImmutable $expiresAt,
        string $reason,
        string $correlationId,
    ): CoreSubscription {
        $this->authorize($actor);
        $this->assertReason($reason);

        [$ownerType, $organization, $workspace] = $this->normalizeOwner($owner);
        $version = $this->publishedVersion($planKey, $planVersion, $ownerType);

        if ($expiresAt->lte($startsAt)) {
            throw new SubscriptionException('subscription_period_invalid', 'The expiration must be after the start.');
        }

        $graceEndsAt = $expiresAt->addDays((int) $version->grace_days);

        return DB::transaction(function () use ($actor, $ownerType, $organization, $workspace, $version, $startsAt, $expiresAt, $graceEndsAt, $reason, $correlationId): CoreSubscription {
            $this->lockOwnerRow($ownerType, $organization, $workspace);

            $existing = $this->findForOwner($ownerType, $organization, $workspace, lock: true);

            if ($existing !== null) {
                if ($this->periodByCorrelation($existing, $correlationId) !== null) {
                    return $existing; // idempotent retry
                }

                throw new SubscriptionException('subscription_exists', 'This owner already has a subscription; renew it instead of assigning a new one.');
            }

            $subscription = CoreSubscription::create([
                'organization_id' => $organization?->id,
                'personal_workspace_id' => $workspace?->id,
                'plan_version_id' => $version->id,
                'starts_at' => $startsAt,
                'expires_at' => $expiresAt,
                'grace_ends_at' => $graceEndsAt,
                'status_version' => 1,
                'created_by_user_id' => $actor->id,
                'updated_by_user_id' => $actor->id,
            ]);

            $this->recordPeriod($subscription, SubscriptionPeriod::OPERATION_INITIAL, $version, $startsAt, $expiresAt, $graceEndsAt, $reason, $correlationId, $actor);
            $this->recordAudit($actor, 'subscription.assigned', $subscription, $version, $reason, $correlationId);

            return $subscription;
        });
    }

    public function renew(
        User $actor,
        CoreSubscription $subscription,
        CarbonImmutable $newExpiresAt,
        ?CarbonImmutable $newStartsAt,
        string $reason,
        string $correlationId,
        ?int $expectedStatusVersion = null,
    ): CoreSubscription {
        $this->authorize($actor);
        $this->assertReason($reason);

        return DB::transaction(function () use ($actor, $subscription, $newExpiresAt, $newStartsAt, $reason, $correlationId, $expectedStatusVersion): CoreSubscription {
            $ownerType = $subscription->isOrganizationOwned() ? 'organization' : 'personal';
            $this->lockOwnerRow(
                $ownerType,
                $subscription->organization_id !== null ? Organization::query()->find($subscription->organization_id) : null,
                $subscription->personal_workspace_id !== null ? Workspace::query()->find($subscription->personal_workspace_id) : null,
            );

            $locked = CoreSubscription::query()->whereKey($subscription->id)->lockForUpdate()->first();

            if ($locked === null) {
                throw new SubscriptionException('subscription_not_found', 'The subscription no longer exists.');
            }

            if ($this->periodByCorrelation($locked, $correlationId) !== null) {
                return $locked; // idempotent retry
            }

            if ($expectedStatusVersion !== null && (int) $locked->status_version !== $expectedStatusVersion) {
                throw new SubscriptionException('subscription_stale_version', 'The subscription changed since it was read; reload and retry.');
            }

            $version = CorePlanVersion::query()->findOrFail($locked->plan_version_id);
            $now = CarbonImmutable::now('UTC');
            $state = $this->lifecycle->evaluate($locked, $now);

            if ($state === SubscriptionState::Invalid || $state === SubscriptionState::Missing) {
                throw new SubscriptionException('subscription_invalid', 'The subscription state is inconsistent and cannot be renewed.');
            }

            $currentExpires = CarbonImmutable::instance($locked->expires_at);

            if ($state === SubscriptionState::Active || $state === SubscriptionState::NotStarted) {
                // Extend from the current expiration boundary.
                $periodStart = $currentExpires;

                if ($newStartsAt !== null && ! $newStartsAt->equalTo($periodStart)) {
                    throw new SubscriptionException('subscription_period_invalid', 'An active subscription renews from its current expiration; a different start is ambiguous.');
                }

                $rowStartsAt = $locked->starts_at;
            } else {
                // Grace or expired: explicit, non-fabricated restart.
                if ($newStartsAt === null) {
                    throw new SubscriptionException('subscription_period_invalid', 'Renewing during grace or after expiry requires an explicit new start.');
                }

                if ($newStartsAt->lt($now)) {
                    throw new SubscriptionException('subscription_period_invalid', 'The new period cannot start in the past; past entitlement is never fabricated.');
                }

                if ($newStartsAt->lt($currentExpires)) {
                    throw new SubscriptionException('subscription_period_invalid', 'The new period would overlap the previous paid window.');
                }

                $periodStart = $newStartsAt;
                $rowStartsAt = $newStartsAt;
            }

            if ($newExpiresAt->lte($periodStart)) {
                throw new SubscriptionException('subscription_period_invalid', 'The new expiration must be after the new period start.');
            }

            $graceEndsAt = $newExpiresAt->addDays((int) $version->grace_days);

            $locked->forceFill([
                'starts_at' => $rowStartsAt,
                'expires_at' => $newExpiresAt,
                'grace_ends_at' => $graceEndsAt,
                'status_version' => (int) $locked->status_version + 1,
                'updated_by_user_id' => $actor->id,
            ])->save();

            $this->recordPeriod($locked, SubscriptionPeriod::OPERATION_RENEWAL, $version, $periodStart, $newExpiresAt, $graceEndsAt, $reason, $correlationId, $actor);
            $this->recordAudit($actor, 'subscription.renewed', $locked, $version, $reason, $correlationId);

            return $locked;
        });
    }

    public function currentForWorkspace(Workspace $workspace): ?CoreSubscription
    {
        return $this->owners->subscriptionForWorkspace($workspace);
    }

    /**
     * @return list<SubscriptionPeriod>
     */
    public function history(CoreSubscription $subscription): array
    {
        return $subscription->periods()->orderBy('id')->get()->all();
    }

    /**
     * Confirm a previewed plan-version change (Stage C5-4).
     *
     * Atomic contract: reauthorize, lock owner row then
     * subscription row (the C5-2 order), revalidate the published
     * target + audience, recompute the impact preview against
     * current activation/usage state, and reject drift with
     * `subscription_change_preview_stale`. The new version governs
     * from the effective instant; period history is append-only —
     * a `plan_change` period records the newly effective terms.
     * Terms semantics: expiry NEVER moves (no service is granted
     * or extended without an authorized renewal); grace follows
     * the newly effective published version, except that an
     * already-expired subscription keeps its elapsed grace end —
     * a plan change alone can never revive it. No module is
     * enabled, disabled, or deleted here.
     */
    public function changePlan(
        User $actor,
        CoreSubscription $subscription,
        string $targetPlanKey,
        int $targetVersion,
        CarbonImmutable $effectiveAt,
        string $reason,
        string $correlationId,
        int $expectedStatusVersion,
        string $confirmationToken,
    ): CoreSubscription {
        $this->authorize($actor);
        $this->assertReason($reason);

        return DB::transaction(function () use ($actor, $subscription, $targetPlanKey, $targetVersion, $effectiveAt, $reason, $correlationId, $expectedStatusVersion, $confirmationToken): CoreSubscription {
            $ownerType = $subscription->isOrganizationOwned() ? 'organization' : 'personal';
            $this->lockOwnerRow(
                $ownerType,
                $subscription->organization_id !== null ? Organization::query()->find($subscription->organization_id) : null,
                $subscription->personal_workspace_id !== null ? Workspace::query()->find($subscription->personal_workspace_id) : null,
            );

            $locked = CoreSubscription::query()->whereKey($subscription->id)->lockForUpdate()->first();

            if ($locked === null) {
                throw new SubscriptionException('subscription_not_found', 'The subscription no longer exists.');
            }

            $priorPeriod = $this->periodByCorrelation($locked, $correlationId);

            if ($priorPeriod !== null) {
                $target = $this->planChanges->publishedTarget($targetPlanKey, $targetVersion, $ownerType);

                if ($priorPeriod->operation === SubscriptionPeriod::OPERATION_PLAN_CHANGE
                    && (int) $priorPeriod->plan_version_id === (int) $target->id) {
                    return $locked; // idempotent retry of the same change
                }

                throw new SubscriptionException('subscription_correlation_conflict', 'The correlation identifier was already used for a different operation.');
            }

            if ((int) $locked->status_version !== $expectedStatusVersion) {
                throw new SubscriptionException('subscription_stale_version', 'The subscription changed since it was read; reload and retry.');
            }

            $preview = $this->planChanges->preview($locked, $targetPlanKey, $targetVersion, $effectiveAt);

            if (! hash_equals($preview->confirmationToken, $confirmationToken)) {
                throw new SubscriptionException('subscription_change_preview_stale', 'The plan-change preview is stale; re-preview and confirm again.');
            }

            if (! $preview->confirmable()) {
                $first = $preview->blockingReasons[0];

                throw new SubscriptionException($first['code'], $first['message']);
            }

            $now = CarbonImmutable::now('UTC');
            $latestPeriod = $locked->periods()->orderByDesc('id')->first();

            if ($effectiveAt->gt($now)) {
                throw new SubscriptionException('subscription_period_invalid', 'A plan change cannot take effect in the future.');
            }

            if ($latestPeriod !== null && $effectiveAt->lt(CarbonImmutable::instance($latestPeriod->effective_starts_at))) {
                throw new SubscriptionException('subscription_period_invalid', 'A plan change cannot predate the current period; retroactive entitlement is never manufactured.');
            }

            $state = $this->lifecycle->evaluate($locked, $now);

            if ($state === SubscriptionState::Invalid || $state === SubscriptionState::Missing) {
                throw new SubscriptionException('subscription_invalid', 'The subscription state is inconsistent and cannot be changed.');
            }

            // Validated again inside the transaction (published +
            // audience) so confirmation never trusts the preview.
            $target = $this->planChanges->publishedTarget($targetPlanKey, $targetVersion, $ownerType);
            $fromVersionId = (int) $locked->plan_version_id;

            // Expiry never moves; grace follows the new version —
            // except an already-expired subscription keeps its
            // elapsed grace end (never revived by a plan change).
            $graceEndsAt = $state === SubscriptionState::Expired
                ? CarbonImmutable::instance($locked->grace_ends_at)
                : CarbonImmutable::instance($locked->expires_at)->addDays((int) $target->grace_days);

            $locked->forceFill([
                'plan_version_id' => $target->id,
                'grace_ends_at' => $graceEndsAt,
                'status_version' => (int) $locked->status_version + 1,
                'updated_by_user_id' => $actor->id,
            ])->save();

            $this->recordPeriod($locked, SubscriptionPeriod::OPERATION_PLAN_CHANGE, $target, $effectiveAt, CarbonImmutable::instance($locked->expires_at), $graceEndsAt, $reason, $correlationId, $actor);

            $this->audit->record($actor, 'subscription.plan_changed', [
                'subscription_id' => (int) $locked->id,
                'owner' => $locked->ownerKey(),
                'from_plan_version_id' => $fromVersionId,
                'to_plan_version_id' => (int) $target->id,
                'effective_at' => $effectiveAt->toIso8601String(),
                'reason' => $reason,
                'correlation_id' => $correlationId,
            ], $locked->isOrganizationOwned() ? 'organization' : 'workspace', $locked->isOrganizationOwned() ? (int) $locked->organization_id : (int) $locked->personal_workspace_id, 'subscription', (int) $locked->id);

            return $locked;
        });
    }

    public function snapshotForWorkspace(Workspace $workspace, ?CarbonImmutable $now = null): SubscriptionSnapshot
    {
        $owner = $this->owners->ownerForWorkspace($workspace);
        $subscription = $this->owners->subscriptionForWorkspace($workspace);
        $state = $this->lifecycle->evaluate($subscription, $now);

        if ($subscription === null) {
            return new SubscriptionSnapshot($state, $owner, null, null, null, null, null);
        }

        $version = CorePlanVersion::query()->with('plan')->findOrFail($subscription->plan_version_id);
        $planSnapshot = $this->plans->snapshot($version->plan->key, (int) $version->version);

        return new SubscriptionSnapshot(
            $state,
            $owner,
            (int) $subscription->id,
            $planSnapshot,
            $subscription->starts_at?->toIso8601String(),
            $subscription->expires_at?->toIso8601String(),
            $subscription->grace_ends_at?->toIso8601String(),
        );
    }

    private function authorize(User $actor): void
    {
        if (! $this->platformAuthorizer->allows($actor, self::PERMISSION)) {
            throw new SubscriptionException('subscription_forbidden', 'Platform subscription management permission is required.');
        }
    }

    private function assertReason(string $reason): void
    {
        if (trim($reason) === '') {
            throw new SubscriptionException('reason_required', 'A reason is required for subscription changes.');
        }
    }

    /** @return array{0: string, 1: ?Organization, 2: ?Workspace} */
    private function normalizeOwner(Organization|Workspace $owner): array
    {
        if ($owner instanceof Organization) {
            return ['organization', $owner, null];
        }

        if ($owner->organization_id !== null || ! $owner->isPersonal()) {
            throw new SubscriptionException('subscription_owner_invalid', 'A personal subscription can only belong to a real personal workspace.');
        }

        return ['personal', null, $owner];
    }

    private function publishedVersion(string $planKey, int $version, string $ownerType): CorePlanVersion
    {
        $plan = CorePlan::query()->where('key', $planKey)->first();

        if ($plan === null) {
            throw new SubscriptionException('plan_version_not_published', "Plan [{$planKey}] does not exist.");
        }

        $audience = $ownerType === 'organization' ? CorePlan::AUDIENCE_ORGANIZATION : CorePlan::AUDIENCE_PERSONAL;

        if ($plan->audience !== $audience) {
            throw new SubscriptionException('subscription_plan_mismatch', "Plan [{$planKey}] audience does not match the subscription owner.");
        }

        $model = $plan->versions()->where('version', $version)->first();

        if ($model === null || ! $model->isPublished()) {
            throw new SubscriptionException('plan_version_not_published', "Plan [{$planKey}] version [{$version}] is not a published version.");
        }

        return $model;
    }

    private function lockOwnerRow(string $ownerType, ?Organization $organization, ?Workspace $workspace): void
    {
        if ($ownerType === 'organization' && $organization !== null) {
            Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
        }

        if ($ownerType === 'personal' && $workspace !== null) {
            Workspace::query()->whereKey($workspace->id)->lockForUpdate()->firstOrFail();
        }
    }

    private function findForOwner(string $ownerType, ?Organization $organization, ?Workspace $workspace, bool $lock): ?CoreSubscription
    {
        $query = CoreSubscription::query();

        if ($ownerType === 'organization') {
            $query->where('organization_id', $organization->id);
        } else {
            $query->where('personal_workspace_id', $workspace->id);
        }

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    private function periodByCorrelation(CoreSubscription $subscription, string $correlationId): ?SubscriptionPeriod
    {
        return $subscription->periods()->where('correlation_id', $correlationId)->first();
    }

    private function recordPeriod(
        CoreSubscription $subscription,
        string $operation,
        CorePlanVersion $version,
        CarbonImmutable $startsAt,
        CarbonImmutable $expiresAt,
        CarbonImmutable $graceEndsAt,
        string $reason,
        string $correlationId,
        User $actor,
    ): void {
        SubscriptionPeriod::create([
            'subscription_id' => $subscription->id,
            'plan_version_id' => $version->id,
            'operation' => $operation,
            'effective_starts_at' => $startsAt,
            'expires_at' => $expiresAt,
            'grace_ends_at' => $graceEndsAt,
            'reason' => $reason,
            'correlation_id' => $correlationId,
            'created_by_user_id' => $actor->id,
        ]);
    }

    private function recordAudit(User $actor, string $action, CoreSubscription $subscription, CorePlanVersion $version, string $reason, string $correlationId): void
    {
        $scopeType = $subscription->isOrganizationOwned() ? 'organization' : 'workspace';
        $scopeId = $subscription->isOrganizationOwned() ? (int) $subscription->organization_id : (int) $subscription->personal_workspace_id;

        $this->audit->record($actor, $action, [
            'subscription_id' => (int) $subscription->id,
            'owner' => $subscription->ownerKey(),
            'plan_version_id' => (int) $version->id,
            'starts_at' => $subscription->starts_at?->toIso8601String(),
            'expires_at' => $subscription->expires_at?->toIso8601String(),
            'grace_ends_at' => $subscription->grace_ends_at?->toIso8601String(),
            'reason' => $reason,
            'correlation_id' => $correlationId,
        ], $scopeType, $scopeId, 'subscription', (int) $subscription->id);
    }
}
