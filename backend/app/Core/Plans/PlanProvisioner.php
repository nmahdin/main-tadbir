<?php

namespace App\Core\Plans;

use App\Core\Modules\CoreModule;
use Illuminate\Support\Facades\DB;

/**
 * Explicit, idempotent plan provisioning (Stage C5-1).
 *
 * This is the ONLY write path for plan definitions. It creates no
 * subscriptions, activates no workspace modules, grants no RBAC
 * permissions, and never publishes implicitly. Repeating a
 * provisioning call with identical intent is a no-op; any drift
 * between the requested and persisted definition is rejected
 * loudly (`plan_drift` / `plan_version_drift`) instead of silently
 * rewriting history. Published versions are immutable through this
 * service and the model guards alike.
 *
 * No commercial content (tiers, prices, values) is defined here —
 * plans enter the system only through explicit provisioning calls
 * carrying approved definitions.
 */
final class PlanProvisioner
{
    public function createPlan(string $key, string $name, string $audience): CorePlan
    {
        if (preg_match('/^[a-z][a-z0-9_-]*$/', $key) !== 1) {
            throw new PlanProvisioningException('plan_key_invalid', "Plan key [{$key}] must be a stable lower-case identifier.");
        }

        if (! in_array($audience, CorePlan::AUDIENCES, true)) {
            throw new PlanProvisioningException('plan_audience_invalid', "Plan audience [{$audience}] is not supported.");
        }

        $existing = CorePlan::query()->where('key', $key)->first();

        if ($existing !== null) {
            if ($existing->name !== $name || $existing->audience !== $audience) {
                throw new PlanProvisioningException('plan_drift', "Plan [{$key}] already exists with different attributes.");
            }

            return $existing;
        }

        return CorePlan::create([
            'key' => $key,
            'name' => $name,
            'audience' => $audience,
            'status' => CorePlan::STATUS_DRAFT,
        ]);
    }

    /**
     * draft -> active, draft|active -> retired. Retired is final.
     */
    public function setPlanStatus(string $key, string $status): CorePlan
    {
        $plan = $this->plan($key);

        $allowed = match ($plan->status) {
            CorePlan::STATUS_DRAFT => [CorePlan::STATUS_ACTIVE, CorePlan::STATUS_RETIRED],
            CorePlan::STATUS_ACTIVE => [CorePlan::STATUS_RETIRED],
            default => [],
        };

        if (! in_array($status, $allowed, true)) {
            throw new PlanProvisioningException('plan_status_invalid', "Plan [{$key}] cannot move from [{$plan->status}] to [{$status}].");
        }

        $plan->forceFill(['status' => $status])->save();

        return $plan;
    }

    public function createDraftVersion(string $planKey, int $version, int $graceDays = 0): CorePlanVersion
    {
        if ($version < 1) {
            throw new PlanProvisioningException('plan_version_invalid', 'Plan version must be a positive integer.');
        }

        if ($graceDays < 0) {
            throw new PlanProvisioningException('plan_version_invalid', 'Grace days cannot be negative.');
        }

        $plan = $this->plan($planKey);
        $existing = $this->findVersion($plan, $version);

        if ($existing !== null) {
            if ((int) $existing->grace_days !== $graceDays) {
                throw new PlanProvisioningException(
                    'plan_version_drift',
                    "Plan [{$planKey}] version [{$version}] already exists with grace_days [{$existing->grace_days}]; use an explicit draft update or a new version.",
                );
            }

            return $existing;
        }

        return CorePlanVersion::create([
            'plan_id' => $plan->id,
            'version' => $version,
            'grace_days' => $graceDays,
        ]);
    }

    public function updateDraftGrace(string $planKey, int $version, int $graceDays): CorePlanVersion
    {
        if ($graceDays < 0) {
            throw new PlanProvisioningException('plan_version_invalid', 'Grace days cannot be negative.');
        }

        $model = $this->draftVersion($planKey, $version);
        $model->forceFill(['grace_days' => $graceDays])->save();

        return $model;
    }

    public function setModuleEntitlement(string $planKey, int $version, string $moduleKey, bool $allowed): void
    {
        $model = $this->draftVersion($planKey, $version);

        $module = CoreModule::query()->where('key', $moduleKey)->first();

        if ($module === null) {
            throw new PlanProvisioningException('unknown_module', "Module [{$moduleKey}] is not a registered module.");
        }

        DB::table('core_plan_module_entitlements')->updateOrInsert(
            ['plan_version_id' => $model->id, 'module_id' => $module->id],
            ['is_allowed' => $allowed],
        );
    }

    public function setLimit(string $planKey, int $version, string $resourceKey, int $limitValue, bool $isUnlimited = false): void
    {
        $model = $this->draftVersion($planKey, $version);
        PlanResourceCatalog::assertKnown($resourceKey);

        if ($limitValue < 0) {
            throw new PlanProvisioningException('limit_invalid', 'A limit value cannot be negative.');
        }

        DB::table('core_plan_limits')->updateOrInsert(
            ['plan_version_id' => $model->id, 'resource_key' => $resourceKey],
            ['limit_value' => $limitValue, 'is_unlimited' => $isUnlimited],
        );
    }

    /**
     * Publish a draft version exactly once. Republishing is a
     * no-op: the original published_at and content are preserved.
     */
    public function publish(string $planKey, int $version): CorePlanVersion
    {
        $plan = $this->plan($planKey);
        $model = $this->findVersion($plan, $version);

        if ($model === null) {
            throw new PlanProvisioningException('plan_version_not_found', "Plan [{$planKey}] has no version [{$version}].");
        }

        if ($model->isPublished()) {
            return $model;
        }

        $model->forceFill(['published_at' => now()])->save();

        return $model;
    }

    /**
     * Read-only snapshot of any version (draft or published).
     */
    public function snapshot(string $planKey, int $version): PlanVersionSnapshot
    {
        $plan = $this->plan($planKey);
        $model = $this->findVersion($plan, $version);

        if ($model === null) {
            throw new PlanProvisioningException('plan_version_not_found', "Plan [{$planKey}] has no version [{$version}].");
        }

        $entitlements = [];
        PlanModuleEntitlement::query()
            ->where('plan_version_id', $model->id)
            ->join('core_modules', 'core_modules.id', '=', 'core_plan_module_entitlements.module_id')
            ->get(['core_modules.key as module_key', 'core_plan_module_entitlements.is_allowed'])
            ->each(function (PlanModuleEntitlement $row) use (&$entitlements): void {
                $entitlements[(string) $row->getAttribute('module_key')] = (bool) $row->getAttribute('is_allowed');
            });

        $limits = [];
        PlanLimit::query()
            ->where('plan_version_id', $model->id)
            ->get()
            ->each(function (PlanLimit $limit) use (&$limits): void {
                $limits[$limit->resource_key] = [
                    'limit_value' => (int) $limit->limit_value,
                    'is_unlimited' => (bool) $limit->is_unlimited,
                ];
            });

        return new PlanVersionSnapshot(
            $planKey,
            (int) $model->version,
            (int) $model->grace_days,
            $model->isPublished(),
            $model->published_at?->toIso8601String(),
            $entitlements,
            $limits,
        );
    }

    /**
     * Highest published version snapshot, or null when the plan has
     * never been published.
     */
    public function latestPublished(string $planKey): ?PlanVersionSnapshot
    {
        $plan = $this->plan($planKey);

        $model = $plan->versions()
            ->whereNotNull('published_at')
            ->orderByDesc('version')
            ->first();

        return $model === null ? null : $this->snapshot($planKey, (int) $model->version);
    }

    private function draftVersion(string $planKey, int $version): CorePlanVersion
    {
        $plan = $this->plan($planKey);
        $model = $this->findVersion($plan, $version);

        if ($model === null) {
            throw new PlanProvisioningException('plan_version_not_found', "Plan [{$planKey}] has no version [{$version}].");
        }

        if ($model->isPublished()) {
            throw new PlanProvisioningException('plan_version_immutable', "Plan [{$planKey}] version [{$version}] is published and immutable.");
        }

        return $model;
    }

    private function plan(string $key): CorePlan
    {
        $plan = CorePlan::query()->where('key', $key)->first();

        if ($plan === null) {
            throw new PlanProvisioningException('plan_not_found', "Plan [{$key}] does not exist.");
        }

        return $plan;
    }

    private function findVersion(CorePlan $plan, int $version): ?CorePlanVersion
    {
        return $plan->versions()->where('version', $version)->first();
    }
}
