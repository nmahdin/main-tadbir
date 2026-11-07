<?php

namespace App\Core\Subscriptions;

use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlanVersion;
use App\Core\Workspaces\Workspace;
use App\Models\ActivityLog;
use App\Models\User;

/**
 * Trusted Free-plan activation (C5-EXT-01 M1, ADR-0022).
 *
 * This is the narrow system path that lets legitimate account
 * activation (personal) and organization creation (AMB-C5-03=B:
 * automatic) receive their approved Free entitlement without a
 * human Platform Management actor. It never relaxes
 * SubscriptionService's platform authorization: the only assignment
 * it can perform is `assignInitialFree`, which itself refuses every
 * non-Free plan key.
 *
 * Outcomes (returned, never silently swallowed):
 *  - activated: a new Free subscription now exists;
 *  - existing:  a subscription already exists on the Free plan (or
 *               with this exact correlation) — idempotent success;
 *  - pending:   the Free plan is not published yet (or a transient
 *               conflict occurred); a `free_activation_pending` row
 *               records the recoverable intent;
 *  - conflict:  a DIFFERENT legitimate subscription already exists —
 *               never overwritten, downgraded, or replaced;
 *  - invalid:   owner/provenance does not check out (programming or
 *               integrity error); nothing is written.
 */
final class FreePlanActivator
{
    public const ACTIVATED = 'activated';

    public const EXISTING = 'existing';

    public const PENDING = 'pending';

    public const CONFLICT = 'conflict';

    public const INVALID = 'invalid';

    public function __construct(
        private readonly SubscriptionService $subscriptions,
        private readonly SubscriptionOwnerResolver $owners,
    ) {}

    public function activateForPersonalWorkspace(User $user, Workspace $workspace, string $correlation): string
    {
        if ($workspace->organization_id !== null || ! $workspace->isPersonal()
            || (int) $workspace->owner_user_id !== (int) $user->id) {
            return self::INVALID;
        }

        try {
            $existing = $this->owners->subscriptionForPersonalWorkspace($workspace);
        } catch (SubscriptionException) {
            return self::INVALID;
        }

        if ($existing !== null) {
            return $this->classifyExisting($existing, $correlation, $this->personalPlanKey());
        }

        return $this->attempt(
            fn (): CoreSubscription => $this->subscriptions->assignInitialFree(
                $user,
                $workspace,
                $this->personalPlanKey(),
                (int) config('billing.free.personal_plan_version', 1),
                $correlation,
            ),
            'ws:'.$workspace->id,
            null,
            (int) $workspace->id,
            (int) $user->id,
            $correlation,
            fn (): ?CoreSubscription => $this->owners->subscriptionForPersonalWorkspace($workspace),
            $this->personalPlanKey(),
        );
    }

    public function activateForOrganization(User $creator, Organization $organization, string $correlation): string
    {
        $existing = $this->owners->subscriptionForOrganization($organization);

        if ($existing !== null) {
            return $this->classifyExisting($existing, $correlation, $this->organizationPlanKey());
        }

        return $this->attempt(
            fn (): CoreSubscription => $this->subscriptions->assignInitialFree(
                $creator,
                $organization,
                $this->organizationPlanKey(),
                (int) config('billing.free.organization_plan_version', 1),
                $correlation,
            ),
            'org:'.$organization->id,
            (int) $organization->id,
            null,
            (int) $creator->id,
            $correlation,
            fn (): ?CoreSubscription => $this->owners->subscriptionForOrganization($organization),
            $this->organizationPlanKey(),
        );
    }

    /** Whether any subscription (Free or paid) already exists for the owner. */
    public function subscriptionForPersonalWorkspace(Workspace $workspace): ?CoreSubscription
    {
        try {
            return $this->owners->subscriptionForPersonalWorkspace($workspace);
        } catch (SubscriptionException) {
            return null;
        }
    }

    private function classifyExisting(CoreSubscription $existing, string $correlation, string $freePlanKey): string
    {
        $version = CorePlanVersion::query()->with('plan')->find($existing->plan_version_id);
        $sameCorrelation = $existing->periods()->where('correlation_id', $correlation)->exists();

        return ($sameCorrelation || $version?->plan?->key === $freePlanKey)
            ? self::EXISTING
            : self::CONFLICT;
    }

    private function attempt(
        callable $assign,
        string $ownerKey,
        ?int $organizationId,
        ?int $workspaceId,
        int $userId,
        string $correlation,
        callable $reread,
        string $freePlanKey,
    ): string {
        try {
            $assign();
            $this->resolvePending($ownerKey);

            return self::ACTIVATED;
        } catch (SubscriptionException $exception) {
            if ($exception->errorCode === 'subscription_exists') {
                // Concurrent activation won the race: classify what
                // is actually there instead of failing.
                $existing = $reread();

                return $existing !== null
                    ? $this->classifyExisting($existing, $correlation, $freePlanKey)
                    : self::CONFLICT;
            }

            $this->recordPending($ownerKey, $organizationId, $workspaceId, $userId, $exception->errorCode);
            ActivityLog::create([
                'user_id' => $userId,
                'action' => 'فعال‌سازی اشتراک رایگان در انتظار انتشار بسته',
                'type' => 'billing.free_activation_pending',
                'details' => 'owner='.$ownerKey.' reason='.$exception->errorCode.' correlation='.$correlation,
            ]);

            return self::PENDING;
        }
    }

    private function recordPending(string $ownerKey, ?int $organizationId, ?int $workspaceId, int $userId, string $reasonCode): void
    {
        $row = FreeActivationPending::query()->firstOrNew(['owner_key' => $ownerKey]);
        $row->fill([
            'organization_id' => $organizationId,
            'personal_workspace_id' => $workspaceId,
            'user_id' => $userId,
            'reason_code' => $reasonCode,
            'attempts' => (int) $row->attempts + 1,
            'resolved_at' => null,
        ])->save();
    }

    private function resolvePending(string $ownerKey): void
    {
        FreeActivationPending::query()
            ->where('owner_key', $ownerKey)
            ->whereNull('resolved_at')
            ->update(['resolved_at' => now()]);
    }

    private function personalPlanKey(): string
    {
        return (string) config('billing.free.personal_plan_key', 'personal-free');
    }

    private function organizationPlanKey(): string
    {
        return (string) config('billing.free.organization_plan_key', 'organization-free');
    }
}
