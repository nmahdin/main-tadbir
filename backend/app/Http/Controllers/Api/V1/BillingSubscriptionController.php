<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\CorePlanPrice;
use App\Core\Organizations\Organization;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Subscriptions\SubscriptionPeriod;
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
            'billing_period' => $this->currentBillingPeriod($sub),
            'starts_at' => $sub->starts_at?->toIso8601String(),
            'expires_at' => $sub->expires_at?->toIso8601String(),
            'grace_ends_at' => $sub->grace_ends_at?->toIso8601String(),
            'entitlements' => $snapshot->entitlements,
            'limits' => collect($snapshot->limits)->map(fn ($l, $k) => ['key' => $k, 'limit_value' => $l['limit_value'], 'is_unlimited' => $l['is_unlimited']])->values()->all(),
        ];
    }

    /**
     * Determine the current purchase period (monthly|quarterly|annual) when
     * the subscription was established or last paid-renewed, or null for
     * Free / legacy subscriptions where we cannot derive an authoritative
     * billing period from the period history.
     */
    private function currentBillingPeriod(CoreSubscription $sub): ?string
    {
        $version = $sub->planVersion;
        $plan = $version?->plan;
        if ($plan === null || $plan->key === (string) config('billing.free.personal_plan_key', 'free-personal')
            || $plan->key === (string) config('billing.free.organization_plan_key', 'free-organization')) {
            return null;
        }

        $paidPeriod = SubscriptionPeriod::query()
            ->where('subscription_id', $sub->id)
            ->whereIn('operation', [
                SubscriptionPeriod::OPERATION_PAID_ACTIVATION,
                SubscriptionPeriod::OPERATION_PAID_RENEWAL,
                SubscriptionPeriod::OPERATION_RENEWAL,
            ])
            ->orderByDesc('id')
            ->first();

        if ($paidPeriod === null || $paidPeriod->paid_by_payment_id === null) {
            return $this->derivePeriodFromTerm($sub);
        }

        $payment = $paidPeriod->paidByPayment;
        if ($payment === null) {
            return $this->derivePeriodFromTerm($sub);
        }

        $order = $payment->order;
        if ($order !== null && in_array($order->period, CorePlanPrice::PERIODS, true)) {
            return $order->period;
        }

        return $this->derivePeriodFromTerm($sub);
    }

    private function derivePeriodFromTerm(CoreSubscription $sub): ?string
    {
        if ($sub->starts_at === null || $sub->expires_at === null) {
            return null;
        }
        $days = (int) round($sub->starts_at->diffInDays($sub->expires_at));
        return match (true) {
            $days >= 350 && $days <= 380 => 'annual',
            $days >= 80 && $days <= 100 => 'quarterly',
            $days >= 25 && $days <= 35 => 'monthly',
            default => null,
        };
    }
}
