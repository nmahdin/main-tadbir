<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Organizations\Organization;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionFulfillment;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M4 read-only subscription view endpoints. Mutations (renew,
 * upgrade, downgrade) all flow through the existing Quote→Order→Payment
 * pipeline; this controller surfaces current state for the UI.
 */
final class BillingSubscriptionController extends Controller
{
    public function __construct(
        private readonly SubscriptionOwnerResolver $owners,
        private readonly SubscriptionLifecycle $lifecycle,
        private readonly PlanProvisioner $plans,
        private readonly MembershipPermissions $permissions,
        private readonly PersonalWorkspaceProvisioner $personalProvisioner,
    ) {}

    public function showForPersonal(Request $request): JsonResponse
    {
        $user = $request->user();
        $ws = $this->personalProvisioner->ensureDefault($user);
        $owner = $this->owners->ownerForWorkspace($ws);
        $subscription = $this->owners->subscriptionForWorkspace($ws);

        return response()->json(['data' => ['subscription' => $this->serialize($subscription, CarbonImmutable::now())]]);
    }

    public function showForOrganization(Request $request, Organization $organization): JsonResponse
    {
        $user = $request->user();
        if (! $this->permissions->allows($user, $organization, 'organization.billing.manage')) {
            return response()->json(['message' => 'اشتراک یافت نشد.', 'code' => 'subscription_not_found'], 404);
        }
        $subscription = CoreSubscription::query()->where('organization_id', $organization->id)->first();

        return response()->json(['data' => ['subscription' => $this->serialize($subscription, CarbonImmutable::now())]]);
    }

    private function serialize(?CoreSubscription $sub, CarbonImmutable $at): ?array
    {
        if ($sub === null) {
            return null;
        }
        $state = $this->lifecycle->evaluate($sub, $at);
        $version = $sub->planVersion;
        $plan = $version->plan;
        $snapshot = $this->plans->snapshot($plan->key, (int) $version->version);

        return [
            'id' => (int) $sub->id,
            'state' => $state->value,
            'plan_key' => $plan->key,
            'plan_version' => (int) $version->version,
            'starts_at' => $sub->starts_at?->toIso8601String(),
            'expires_at' => $sub->expires_at?->toIso8601String(),
            'grace_ends_at' => $sub->grace_ends_at?->toIso8601String(),
            'entitlements' => $snapshot->entitlements,
            'limits' => collect($snapshot->limits)->map(fn ($l, $k) => ['key' => $k, 'limit_value' => $l['limit_value'], 'is_unlimited' => $l['is_unlimited']])->values()->all(),
        ];
    }
}
