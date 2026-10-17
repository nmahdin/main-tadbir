<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlanVersion;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\PlanChangePlanner;
use App\Core\Subscriptions\PlanChangePreview;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform subscription administration (Stage C5-4).
 *
 * Thin adapters over SubscriptionService / PlanChangePlanner —
 * every rule (authorization, locking, renewal/plan-change
 * semantics, audit, idempotency) lives in the domain services.
 * The MVP exposes a single subscription permission,
 * `platform.subscriptions.manage`, for reads and mutations alike
 * (no broader implicit platform privilege is invented); the
 * service re-evaluates it inside every mutation regardless.
 * Responses expose subscription identity, plan identity, state,
 * and UTC boundaries only — never operational workspace data, and
 * never mutation reasons (those remain in the platform audit).
 */
final class PlatformSubscriptionController extends Controller
{
    use AuthorizesPlatformRequests;

    public function showOrganization(Request $request, Organization $organization, SubscriptionOwnerResolver $owners): JsonResponse
    {
        $this->platformActor($request, SubscriptionService::PERMISSION);

        $subscription = $owners->subscriptionForOrganization($organization);

        return $subscription === null
            ? $this->notFound()
            : response()->json(['data' => $this->subscriptionData($subscription)]);
    }

    public function showWorkspace(Request $request, Workspace $workspace, SubscriptionOwnerResolver $owners): JsonResponse
    {
        $this->platformActor($request, SubscriptionService::PERMISSION);

        try {
            $subscription = $owners->subscriptionForWorkspace($workspace);
        } catch (SubscriptionException $exception) {
            return $this->domainError($exception);
        }

        return $subscription === null
            ? $this->notFound()
            : response()->json(['data' => $this->subscriptionData($subscription)]);
    }

    public function assignOrganization(Request $request, Organization $organization, SubscriptionService $subscriptions): JsonResponse
    {
        return $this->assign($request, $subscriptions, $organization);
    }

    public function assignWorkspace(Request $request, Workspace $workspace, SubscriptionService $subscriptions): JsonResponse
    {
        return $this->assign($request, $subscriptions, $workspace);
    }

    public function renew(Request $request, CoreSubscription $subscription, SubscriptionService $subscriptions): JsonResponse
    {
        $actor = $this->platformActor($request, SubscriptionService::PERMISSION);

        $data = $request->validate([
            'expires_at' => ['required', 'date'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'reason' => ['required', 'string', 'max:500'],
            'correlation_id' => ['required', 'string', 'max:80'],
            'status_version' => ['required', 'integer', 'min:1'],
        ]);

        try {
            $updated = $subscriptions->renew(
                $actor,
                $subscription,
                CarbonImmutable::parse($data['expires_at']),
                isset($data['starts_at']) && $data['starts_at'] !== null ? CarbonImmutable::parse($data['starts_at']) : null,
                $data['reason'],
                $data['correlation_id'],
                (int) $data['status_version'],
            );
        } catch (SubscriptionException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->subscriptionData($updated)]);
    }

    public function previewPlanChange(Request $request, CoreSubscription $subscription, PlanChangePlanner $planner): JsonResponse
    {
        $this->platformActor($request, SubscriptionService::PERMISSION);

        $data = $request->validate([
            'plan_key' => ['required', 'string', 'max:80'],
            'plan_version' => ['required', 'integer', 'min:1'],
            'effective_at' => ['sometimes', 'nullable', 'date'],
        ]);

        try {
            $preview = $planner->preview(
                $subscription,
                $data['plan_key'],
                (int) $data['plan_version'],
                isset($data['effective_at']) && $data['effective_at'] !== null ? CarbonImmutable::parse($data['effective_at']) : CarbonImmutable::now('UTC'),
            );
        } catch (SubscriptionException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->previewData($preview)]);
    }

    public function planChange(Request $request, CoreSubscription $subscription, SubscriptionService $subscriptions): JsonResponse
    {
        $actor = $this->platformActor($request, SubscriptionService::PERMISSION);

        $data = $request->validate([
            'plan_key' => ['required', 'string', 'max:80'],
            'plan_version' => ['required', 'integer', 'min:1'],
            'effective_at' => ['required', 'date'],
            'confirmation_token' => ['required', 'string'],
            'status_version' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'max:500'],
            'correlation_id' => ['required', 'string', 'max:80'],
        ]);

        try {
            $updated = $subscriptions->changePlan(
                $actor,
                $subscription,
                $data['plan_key'],
                (int) $data['plan_version'],
                CarbonImmutable::parse($data['effective_at']),
                $data['reason'],
                $data['correlation_id'],
                (int) $data['status_version'],
                $data['confirmation_token'],
            );
        } catch (SubscriptionException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->subscriptionData($updated)]);
    }

    public function history(Request $request, CoreSubscription $subscription, SubscriptionService $subscriptions): JsonResponse
    {
        $this->platformActor($request, SubscriptionService::PERMISSION);

        return response()->json(['data' => array_map(
            fn (SubscriptionPeriod $period): array => $this->periodData($period),
            $subscriptions->history($subscription),
        )]);
    }

    private function assign(Request $request, SubscriptionService $subscriptions, Organization|Workspace $owner): JsonResponse
    {
        $actor = $this->platformActor($request, SubscriptionService::PERMISSION);

        $data = $request->validate([
            'plan_key' => ['required', 'string', 'max:80'],
            'plan_version' => ['required', 'integer', 'min:1'],
            'starts_at' => ['required', 'date'],
            'expires_at' => ['required', 'date'],
            'reason' => ['required', 'string', 'max:500'],
            'correlation_id' => ['required', 'string', 'max:80'],
        ]);

        try {
            $subscription = $subscriptions->assignInitial(
                $actor,
                $owner,
                $data['plan_key'],
                (int) $data['plan_version'],
                CarbonImmutable::parse($data['starts_at']),
                CarbonImmutable::parse($data['expires_at']),
                $data['reason'],
                $data['correlation_id'],
            );
        } catch (SubscriptionException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->subscriptionData($subscription)], 201);
    }

    private function subscriptionData(CoreSubscription $subscription): array
    {
        $version = CorePlanVersion::query()->with('plan')->find($subscription->plan_version_id);

        return [
            'id' => (int) $subscription->id,
            'owner' => [
                'type' => $subscription->isOrganizationOwned() ? 'organization' : 'personal',
                'organization_id' => $subscription->organization_id !== null ? (int) $subscription->organization_id : null,
                'personal_workspace_id' => $subscription->personal_workspace_id !== null ? (int) $subscription->personal_workspace_id : null,
            ],
            'state' => app(SubscriptionLifecycle::class)->evaluate($subscription)->value,
            'plan' => $version === null ? null : [
                'key' => $version->plan->key,
                'version' => (int) $version->version,
                'grace_days' => (int) $version->grace_days,
            ],
            'starts_at' => $subscription->starts_at?->toIso8601String(),
            'expires_at' => $subscription->expires_at?->toIso8601String(),
            'grace_ends_at' => $subscription->grace_ends_at?->toIso8601String(),
            'status_version' => (int) $subscription->status_version,
            'created_by_user_id' => $subscription->created_by_user_id !== null ? (int) $subscription->created_by_user_id : null,
            'updated_by_user_id' => $subscription->updated_by_user_id !== null ? (int) $subscription->updated_by_user_id : null,
            'created_at' => $subscription->created_at?->toIso8601String(),
            'updated_at' => $subscription->updated_at?->toIso8601String(),
        ];
    }

    private function previewData(PlanChangePreview $preview): array
    {
        return [
            'subscription_id' => $preview->subscriptionId,
            'owner' => ['key' => $preview->ownerKey, 'type' => $preview->ownerType],
            'current_plan' => $preview->currentPlan,
            'target_plan' => $preview->targetPlan,
            'effective_at' => $preview->effectiveAt,
            'retained_modules' => $preview->retainedModules,
            'losing_modules' => $preview->losingModules,
            'gaining_modules' => $preview->gainingModules,
            'enabled_affected' => $preview->enabledAffected,
            'dependency_impacts' => $preview->dependencyImpacts,
            'limits' => $preview->limits,
            'warnings' => $preview->warnings,
            'blocking_reasons' => $preview->blockingReasons,
            'confirmable' => $preview->confirmable(),
            'confirmation_token' => $preview->confirmationToken,
        ];
    }

    private function periodData(SubscriptionPeriod $period): array
    {
        $version = CorePlanVersion::query()->with('plan')->find($period->plan_version_id);

        return [
            'id' => (int) $period->id,
            'operation' => $period->operation,
            'plan' => $version === null ? null : [
                'key' => $version->plan->key,
                'version' => (int) $version->version,
            ],
            'effective_starts_at' => $period->effective_starts_at?->toIso8601String(),
            'expires_at' => $period->expires_at?->toIso8601String(),
            'grace_ends_at' => $period->grace_ends_at?->toIso8601String(),
            'correlation_id' => $period->correlation_id,
            'created_by_user_id' => $period->created_by_user_id !== null ? (int) $period->created_by_user_id : null,
            'created_at' => $period->created_at?->toIso8601String(),
        ];
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'message' => 'No subscription exists for this owner.',
            'code' => 'subscription_not_found',
        ], 404);
    }

    private function domainError(SubscriptionException $exception): JsonResponse
    {
        [$status, $code] = match ($exception->errorCode) {
            'subscription_forbidden' => [403, 'platform_forbidden'],
            'subscription_stale_version', 'subscription_change_preview_stale', 'subscription_exists', 'subscription_correlation_conflict' => [409, $exception->errorCode],
            'subscription_not_found' => [404, $exception->errorCode],
            default => [422, $exception->errorCode],
        };

        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $code,
        ], $status);
    }
}
