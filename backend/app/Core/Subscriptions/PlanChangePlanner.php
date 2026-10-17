<?php

namespace App\Core\Subscriptions;

use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Workspaces\Workspace;
use Carbon\CarbonImmutable;

/**
 * Read-only plan-change impact planner (Stage C5-4).
 *
 * Compares the subscription's currently effective published plan
 * version with a requested published destination version and
 * computes the full impact across the owner's scope (every
 * organization-owned workspace, or the one personal workspace) —
 * never touching unrelated or other-scope workspaces. The planner
 * NEVER mutates state. Its confirmation token fingerprints the
 * subscription version, both plan versions, the in-scope enabled
 * module sets, the limit/usage picture, and the effective instant,
 * so any drift (renewal, activation change, usage change, another
 * plan change) makes a preview stale.
 */
final class PlanChangePlanner
{
    public function __construct(
        private readonly SubscriptionOwnerResolver $owners,
        private readonly PlanProvisioner $plans,
        private readonly ModuleActivationPlanner $modulePlanner,
        private readonly ModuleDependencyResolver $resolver,
        private readonly ResourceUsageReader $usage,
    ) {}

    /**
     * @throws SubscriptionException on unknown/unpublished/incompatible targets
     */
    public function preview(CoreSubscription $subscription, string $targetPlanKey, int $targetVersion, CarbonImmutable $effectiveAt): PlanChangePreview
    {
        $owner = $this->ownerOf($subscription);
        $current = CorePlanVersion::query()->with('plan')->findOrFail($subscription->plan_version_id);
        $target = $this->publishedTarget($targetPlanKey, $targetVersion, $owner->type);

        $currentSnapshot = $this->plans->snapshot($current->plan->key, (int) $current->version);
        $targetSnapshot = $this->plans->snapshot($targetPlanKey, $targetVersion);

        $entitled = static fn (array $entitlements): array => array_values(array_keys(array_filter($entitlements)));
        $currentEntitled = $entitled($currentSnapshot->entitlements);
        $targetEntitled = $entitled($targetSnapshot->entitlements);
        sort($currentEntitled);
        sort($targetEntitled);

        $retained = array_values(array_intersect($currentEntitled, $targetEntitled));
        $losing = array_values(array_diff($currentEntitled, $targetEntitled));
        $gaining = array_values(array_diff($targetEntitled, $currentEntitled));

        // In-scope workspaces and their enabled modules.
        $workspaces = $this->scopeWorkspaces($owner);
        $enabledAffected = [];
        $enabledFingerprint = [];
        foreach ($workspaces as $workspace) {
            $enabled = $this->modulePlanner->enabledModuleKeys($workspace);
            $enabledFingerprint[(int) $workspace->id] = $enabled;
            $affected = array_values(array_intersect($enabled, $losing));
            if ($affected !== []) {
                $enabledAffected[(int) $workspace->id] = $affected;
            }
        }

        // Modules whose activation eligibility degrades because a
        // prerequisite loses entitlement.
        $dependencyImpacts = [];
        foreach (\App\Core\Modules\ModuleCatalog::keys() as $moduleKey) {
            $lostPrerequisites = array_values(array_intersect($this->resolver->prerequisitesFor($moduleKey), $losing));
            if ($lostPrerequisites !== []) {
                $dependencyImpacts[$moduleKey] = $lostPrerequisites;
            }
        }

        [$limits, $limitWarnings, $limitBlocking] = $this->compareLimits($owner, $currentSnapshot->limits, $targetSnapshot->limits);

        $warnings = $limitWarnings;
        $blocking = $limitBlocking;

        if ((int) $current->id === (int) $target->id) {
            $blocking[] = ['code' => 'subscription_plan_unchanged', 'message' => 'The target plan version is already in effect.'];
        }

        $token = $this->confirmationToken($subscription, $current, $target, $enabledFingerprint, $limits, $effectiveAt);

        return new PlanChangePreview(
            (int) $subscription->id,
            $owner->key(),
            $owner->type,
            ['key' => $current->plan->key, 'version' => (int) $current->version, 'grace_days' => (int) $current->grace_days],
            ['key' => $targetPlanKey, 'version' => $targetVersion, 'grace_days' => (int) $target->grace_days],
            $effectiveAt->toIso8601String(),
            $retained,
            $losing,
            $gaining,
            $enabledAffected,
            $dependencyImpacts,
            $limits,
            $warnings,
            $blocking,
            $token,
        );
    }

    public function publishedTarget(string $planKey, int $version, string $ownerType): CorePlanVersion
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

    public function ownerOf(CoreSubscription $subscription): SubscriptionOwner
    {
        if ($subscription->isOrganizationOwned()) {
            $organization = $subscription->organization()->firstOrFail();

            return new SubscriptionOwner('organization', $organization, null);
        }

        $workspace = $subscription->personalWorkspace()->firstOrFail();

        return new SubscriptionOwner('personal', null, $workspace);
    }

    /** @return list<Workspace> */
    public function scopeWorkspaces(SubscriptionOwner $owner): array
    {
        if ($owner->type === 'organization') {
            return Workspace::query()
                ->where('organization_id', $owner->organization->id)
                ->orderBy('id')
                ->get()
                ->all();
        }

        return [$owner->personalWorkspace];
    }

    private function confirmationToken(
        CoreSubscription $subscription,
        CorePlanVersion $current,
        CorePlanVersion $target,
        array $enabledFingerprint,
        array $limits,
        CarbonImmutable $effectiveAt,
    ): string {
        ksort($enabledFingerprint);

        return hash('sha256', (string) json_encode([
            'subscription_id' => (int) $subscription->id,
            'status_version' => (int) $subscription->status_version,
            'current_plan_version_id' => (int) $current->id,
            'target_plan_version_id' => (int) $target->id,
            'enabled' => $enabledFingerprint,
            'limits' => $limits,
            'effective_at' => $effectiveAt->toIso8601String(),
        ]));
    }

    /**
     * @param  array<string, array{limit_value: int, is_unlimited: bool}>  $oldLimits
     * @param  array<string, array{limit_value: int, is_unlimited: bool}>  $newLimits
     * @return array{0: list<array>, 1: list<array>, 2: list<array>}
     */
    private function compareLimits(SubscriptionOwner $owner, array $oldLimits, array $newLimits): array
    {
        $usage = $this->usage->measure($owner);
        $resources = array_values(array_unique([...array_keys($oldLimits), ...array_keys($newLimits)]));
        sort($resources);

        $entries = [];
        $warnings = [];
        $blocking = [];

        foreach ($resources as $resource) {
            $old = $oldLimits[$resource] ?? null;
            $new = $newLimits[$resource] ?? null;
            $measured = $usage[$resource] ?? null;

            $status = 'ok';
            $excess = null;

            if ($new !== null && ! $new['is_unlimited']) {
                if ($measured === null) {
                    $status = 'unknown';
                    $blocking[] = ['code' => 'usage_unknown', 'message' => "Current usage for [{$resource}] cannot be measured, so capping it cannot be validated."];
                } elseif ($measured > $new['limit_value']) {
                    $status = 'over_limit';
                    $excess = $measured - $new['limit_value'];
                    $warnings[] = ['code' => 'over_limit', 'message' => "Current usage for [{$resource}] exceeds the new limit by {$excess}; existing records are preserved and growth enforcement is deferred to later stages."];
                }
            }

            $entries[] = [
                'resource' => $resource,
                'old' => $old,
                'new' => $new,
                'usage' => $measured,
                'status' => $status,
                'excess' => $excess,
            ];
        }

        return [$entries, $warnings, $blocking];
    }
}
