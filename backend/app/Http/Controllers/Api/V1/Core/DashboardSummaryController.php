<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Audit\AuditLog;
use App\Core\Invitations\CoreInvitation;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Platform\PlatformAuthorizer;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Subscriptions\CoreResourceUsageReader;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Subscriptions\SubscriptionState;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * UX-02-2 read-only dashboard summaries.
 *
 * Additive endpoints: every number is computed from the same Core
 * data the management surfaces already expose, and every section is
 * gated by the exact permission that governs its management surface.
 * A section the caller may not see is returned as null — never as a
 * fabricated zero — so the UI can show an honest unavailable state.
 * Nothing here widens visibility: platform sections require the
 * matching platform permission, organization sections require an
 * ACTIVE membership plus the matching organization permission.
 */
class DashboardSummaryController extends Controller
{
    public function platform(
        Request $request,
        PlatformAuthorizer $authorizer,
        SubscriptionLifecycle $lifecycle,
    ): JsonResponse {
        $user = $request->user();

        if ($authorizer->activeAssignment($user) === null) {
            return response()->json([
                'message' => 'دسترسی مدیریت پلتفرم برای این عملیات مجاز نیست.',
                'code' => 'platform_forbidden',
            ], 403);
        }

        $organizations = null;
        if ($authorizer->allows($user, 'platform.organizations.view')) {
            $organizations = [
                'total' => Organization::query()->count(),
                'active' => Organization::query()->where('status', 'active')->count(),
                'suspended' => Organization::query()->where('status', 'suspended')->count(),
                'without_subscription' => Organization::query()
                    ->whereNotExists(fn ($query) => $query
                        ->selectRaw('1')
                        ->from('core_subscriptions')
                        ->whereColumn('core_subscriptions.organization_id', 'organizations.id'))
                    ->count(),
            ];
        }

        $users = null;
        if ($authorizer->allows($user, 'platform.users.view')) {
            $users = ['total' => User::query()->count()];
        }

        $subscriptions = null;
        if ($authorizer->allows($user, SubscriptionService::PERMISSION)) {
            $now = CarbonImmutable::now('UTC');
            $states = [SubscriptionState::Active->value => 0, SubscriptionState::Grace->value => 0, SubscriptionState::Expired->value => 0, SubscriptionState::NotStarted->value => 0];
            $expiringWithin30Days = 0;
            CoreSubscription::query()->chunkById(200, function ($rows) use ($lifecycle, $now, &$states, &$expiringWithin30Days): void {
                foreach ($rows as $subscription) {
                    $state = $lifecycle->evaluate($subscription, $now);
                    if (array_key_exists($state->value, $states)) {
                        $states[$state->value]++;
                    }
                    if ($state === SubscriptionState::Active && $subscription->expires_at !== null
                        && CarbonImmutable::instance($subscription->expires_at)->lte($now->addDays(30))) {
                        $expiringWithin30Days++;
                    }
                }
            });
            $subscriptions = [
                'total' => array_sum($states),
                'active' => $states[SubscriptionState::Active->value],
                'grace' => $states[SubscriptionState::Grace->value],
                'expired' => $states[SubscriptionState::Expired->value],
                'not_started' => $states[SubscriptionState::NotStarted->value],
                'expiring_within_30_days' => $expiringWithin30Days,
            ];
        }

        $recentActivity = null;
        if ($authorizer->allows($user, 'platform.audit.view')) {
            $recentActivity = $this->activityItems(AuditLog::query()->orderByDesc('id')->limit(5)->get());
        }

        return response()->json(['data' => [
            'organizations' => $organizations,
            'users' => $users,
            'subscriptions' => $subscriptions,
            'recent_activity' => $recentActivity,
        ]]);
    }

    public function organization(
        Request $request,
        Organization $organization,
        MembershipPermissions $permissions,
        SubscriptionOwnerResolver $owners,
        SubscriptionLifecycle $lifecycle,
        CoreResourceUsageReader $usage,
    ): JsonResponse {
        $user = $request->user();

        $isActiveMember = $organization->isActive() && $organization->memberships()
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->exists();

        if (! $isActiveMember) {
            return response()->json([
                'message' => 'شما به این سازمان دسترسی ندارید.',
                'code' => 'organization_unavailable',
            ], 403);
        }

        $keys = $permissions->organizationPermissionKeys($user, $organization);
        $can = fn (string $permission): bool => in_array($permission, $keys, true);

        $members = null;
        if ($can('organization.members.view')) {
            $members = [
                'active' => $organization->memberships()->where('status', MembershipStatus::Active->value)->count(),
            ];
        }

        $workspaces = null;
        if ($can('organization.view')) {
            $workspaces = [
                'total' => Workspace::query()->where('organization_id', $organization->id)->count(),
            ];
        }

        $subscription = null;
        if ($can('organization.view')) {
            $record = $owners->subscriptionForOrganization($organization);
            if ($record === null) {
                // Permitted but nothing assigned yet: an honest
                // "missing" state, distinct from a forbidden section.
                $subscription = [
                    'state' => SubscriptionState::Missing->value,
                    'plan' => null,
                    'starts_at' => null,
                    'expires_at' => null,
                    'grace_ends_at' => null,
                    'limits' => [],
                ];
            } else {
                $version = $record->planVersion()->with('plan')->first();
                $limits = [];
                if ($version !== null) {
                    $measured = $usage->measure(new SubscriptionOwner('organization', $organization, null));
                    foreach ($version->limits()->get() as $limit) {
                        $limits[] = [
                            'resource_key' => $limit->resource_key,
                            'limit_value' => $limit->is_unlimited ? null : (int) $limit->limit_value,
                            'is_unlimited' => (bool) $limit->is_unlimited,
                            'usage' => $measured[$limit->resource_key] ?? null,
                        ];
                    }
                }
                $subscription = [
                    'state' => $lifecycle->evaluate($record)->value,
                    'plan' => $version === null ? null : [
                        'key' => $version->plan->key,
                        'version' => (int) $version->version,
                    ],
                    'starts_at' => $record->starts_at?->toIso8601String(),
                    'expires_at' => $record->expires_at?->toIso8601String(),
                    'grace_ends_at' => $record->grace_ends_at?->toIso8601String(),
                    'limits' => $limits,
                ];
            }
        }

        $invitations = null;
        if ($can('organization.members.manage')) {
            $now = CarbonImmutable::now('UTC');
            $pending = CoreInvitation::query()
                ->where('organization_id', $organization->id)
                ->where('status', CoreInvitation::STATUS_PENDING)
                ->where('expires_at', '>', $now)
                ->count();
            $recent = CoreInvitation::query()
                ->where('organization_id', $organization->id)
                ->orderByDesc('id')
                ->limit(3)
                ->get()
                ->map(fn (CoreInvitation $invitation): array => [
                    'id' => (int) $invitation->id,
                    'email' => $invitation->email_normalized,
                    'state' => $invitation->effectiveState($now)->value,
                    'created_at' => $invitation->created_at?->toIso8601String(),
                ])->all();
            $invitations = ['pending' => $pending, 'recent' => $recent];
        }

        $recentActivity = null;
        if ($can('organization.members.view')) {
            $recentActivity = $this->activityItems(AuditLog::query()
                ->where('scope_type', 'organization')
                ->where('scope_id', $organization->id)
                ->orderByDesc('id')
                ->limit(6)
                ->get());
        }

        return response()->json(['data' => [
            'members' => $members,
            'workspaces' => $workspaces,
            'subscription' => $subscription,
            'invitations' => $invitations,
            'recent_activity' => $recentActivity,
        ]]);
    }

    /**
     * @param  iterable<AuditLog>  $logs
     * @return array<int, array<string, mixed>>
     */
    private function activityItems(iterable $logs): array
    {
        $logs = collect($logs);
        $actorNames = User::query()
            ->whereIn('id', $logs->pluck('actor_user_id')->filter()->unique()->all())
            ->pluck('name', 'id');

        return $logs->map(fn (AuditLog $log): array => [
            'id' => (int) $log->id,
            'action' => $log->action,
            'actor_name' => $log->actor_user_id !== null ? ($actorNames[$log->actor_user_id] ?? null) : null,
            'target_type' => $log->target_type,
            'target_id' => $log->target_id !== null ? (int) $log->target_id : null,
            'created_at' => $log->created_at?->toIso8601String(),
        ])->values()->all();
    }
}
