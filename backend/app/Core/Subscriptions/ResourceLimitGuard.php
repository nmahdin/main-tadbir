<?php

namespace App\Core\Subscriptions;

use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Runtime plan-limit enforcement at create points (C5-EXT-01 M1).
 *
 * Policy (approved): limits constrain only the relevant NEW writes;
 * existing data stays readable and untouched (B04). Enforcement
 * applies when the owner actually has a subscription with a
 * published limit for the resource — owners without any
 * subscription keep legacy behavior (module access remains governed
 * separately by the C5-3 entitlement evaluator; this guard never
 * invents an entitlement). An unknown (null) measurement fails
 * closed for that create with `usage_unknown`, matching the C5-4
 * contract, instead of fabricating a number.
 *
 * Guard failures are ValidationException (HTTP 422) with Persian
 * messages, so every existing request path renders them safely.
 */
final class ResourceLimitGuard
{
    /** @var array<string, string> */
    private const LABELS = [
        'workspaces' => 'فضای کاری',
        'organization_members' => 'عضو سازمان',
        'workspace_members' => 'عضو فضای کاری',
        'projects' => 'پروژهٔ فعال',
        'storage_bytes' => 'فضای ذخیره‌سازی',
    ];

    public function __construct(
        private readonly SubscriptionService $subscriptions,
        private readonly CoreResourceUsageReader $usage,
    ) {}

    /**
     * Assert one more unit of $resourceKey may be created inside the
     * subscription scope that owns $workspace.
     */
    public function assertCanCreate(Workspace $workspace, string $resourceKey): void
    {
        $snapshot = $this->subscriptions->snapshotForWorkspace($workspace);

        if ($snapshot->subscriptionId === null || $snapshot->plan === null) {
            return;
        }

        $limit = $snapshot->plan->limits[$resourceKey] ?? null;

        if ($limit === null || $limit['is_unlimited']) {
            return;
        }

        $measured = $this->usage->measure($snapshot->owner);
        $used = $measured[$resourceKey] ?? null;

        if ($used === null) {
            throw ValidationException::withMessages([
                'plan' => 'میزان مصرف فعلی قابل اندازه‌گیری نیست؛ ایجاد مورد تازه موقتاً ممکن نیست.',
            ]);
        }

        if ($used + 1 > $limit['limit_value']) {
            throw ValidationException::withMessages([
                'plan' => sprintf(
                    'سقف %s در اشتراک فعلی تکمیل شده است (%d از %d). برای ادامه، اشتراک را ارتقا دهید؛ داده‌های فعلی شما دست‌نخورده باقی می‌مانند.',
                    self::LABELS[$resourceKey] ?? $resourceKey,
                    $used,
                    $limit['limit_value'],
                ),
            ]);
        }
    }

    /** Organization-scoped assertion (e.g. organization member cap) without needing a workspace handle. */
    public function assertCanCreateForOrganization(Organization $organization, string $resourceKey): void
    {
        $subscription = CoreSubscription::query()
            ->where('organization_id', $organization->id)
            ->first();

        if ($subscription === null) {
            return;
        }

        $version = CorePlanVersion::query()->with('plan')->find($subscription->plan_version_id);

        if ($version === null || $version->plan === null) {
            return;
        }

        $snapshot = app(PlanProvisioner::class)->snapshot($version->plan->key, (int) $version->version);
        $limit = $snapshot->limits[$resourceKey] ?? null;

        if ($limit === null || $limit['is_unlimited']) {
            return;
        }

        $owner = new SubscriptionOwner('organization', $organization, null);
        $measured = $this->usage->measure($owner);
        $used = $measured[$resourceKey] ?? null;

        if ($used === null) {
            throw ValidationException::withMessages([
                'plan' => 'میزان مصرف فعلی قابل اندازه‌گیری نیست؛ ایجاد مورد تازه موقتاً ممکن نیست.',
            ]);
        }

        if ($used + 1 > $limit['limit_value']) {
            throw ValidationException::withMessages([
                'plan' => sprintf(
                    'سقف %s در اشتراک فعلی تکمیل شده است (%d از %d). برای ادامه، اشتراک را ارتقا دهید؛ داده‌های فعلی شما دست‌نخورده باقی می‌مانند.',
                    self::LABELS[$resourceKey] ?? $resourceKey,
                    $used,
                    $limit['limit_value'],
                ),
            ]);
        }
    }

    /** Personal owners may hold additional personal workspaces only within the plan's `workspaces` limit. */
    public function assertCanCreatePersonalWorkspace(User $user): void
    {
        $default = Workspace::personal()
            ->where('owner_user_id', $user->id)
            ->where('is_default', true)
            ->first();

        if ($default === null) {
            return; // ensureDefault creates the first one.
        }

        $snapshot = $this->subscriptions->snapshotForWorkspace($default);

        if ($snapshot->subscriptionId === null || $snapshot->plan === null) {
            return;
        }

        $limit = $snapshot->plan->limits['workspaces'] ?? null;

        if ($limit === null || $limit['is_unlimited']) {
            return;
        }

        $current = Workspace::personal()->where('owner_user_id', $user->id)->count();

        if ($current + 1 > $limit['limit_value']) {
            throw ValidationException::withMessages([
                'plan' => sprintf(
                    'سقف %s در اشتراک فعلی تکمیل شده است (%d از %d). برای ادامه، اشتراک را ارتقا دهید؛ داده‌های فعلی شما دست‌نخورده باقی می‌مانند.',
                    self::LABELS['workspaces'],
                    $current,
                    $limit['limit_value'],
                ),
            ]);
        }
    }

    /**
     * Storage guard for user-owned (DAM) uploads — the supported
     * storage scope in M1. Uploads have no organization context in
     * the DAM schema, so organization storage enforcement is not
     * claimed (see CoreResourceUsageReader).
     */
    public function assertStorageAvailable(User $user, int $incomingBytes): void
    {
        $default = Workspace::personal()
            ->where('owner_user_id', $user->id)
            ->where('is_default', true)
            ->first();

        if ($default === null) {
            return;
        }

        $snapshot = $this->subscriptions->snapshotForWorkspace($default);

        if ($snapshot->subscriptionId === null || $snapshot->plan === null) {
            return;
        }

        $limit = $snapshot->plan->limits['storage_bytes'] ?? null;

        if ($limit === null || $limit['is_unlimited']) {
            return;
        }

        $measured = $this->usage->measure($snapshot->owner);
        $used = $measured['storage_bytes'] ?? null;

        if ($used === null) {
            return; // Unknown measure: do not fabricate a block.
        }

        if ($used + $incomingBytes > $limit['limit_value']) {
            throw ValidationException::withMessages([
                'plan' => sprintf(
                    'سقف %s در اشتراک فعلی تکمیل شده است. برای ادامه، اشتراک را ارتقا دهید؛ فایل‌های فعلی شما دست‌نخورده باقی می‌مانند.',
                    self::LABELS['storage_bytes'],
                ),
            ]);
        }
    }
}
