<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Plans\ModuleAccessLevel;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\PlanChangePlanner;
use App\Core\Subscriptions\PlanChangePreview;
use App\Core\Subscriptions\SubscriptionEntitlementEvaluator;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Subscriptions\SubscriptionState;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Plan-change preview & confirmation (Stage C5-4).
 *
 * Preview is deterministic and side-effect free; confirmation
 * recomputes under owner→subscription locks, rejects drift with
 * `subscription_change_preview_stale`, appends immutable
 * `plan_change` period history, never moves expiry, and never
 * revives an expired subscription.
 */
class PlanChangeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $creator;

    private Organization $org;

    private Workspace $ws1;

    private Workspace $ws2;

    private CoreSubscription $subscription;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $this->admin = $this->platformAdmin();
        $this->creator = User::factory()->create(['username' => 'pc_owner']);
        $this->org = app(\App\Core\Organizations\OrganizationProvisioner::class)->create($this->creator, 'Plan Change Org');
        $this->ws1 = $this->org->workspaces()->where('is_default', true)->firstOrFail();
        $this->ws2 = Workspace::factory()->for($this->org, 'organization')->create(['owner_user_id' => null]);

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('growth', 'Growth', 'organization');
        $plans->createDraftVersion('growth', 1, 7);
        $plans->setModuleEntitlement('growth', 1, 'projects', true);
        $plans->setModuleEntitlement('growth', 1, 'crm', true);
        $plans->setLimit('growth', 1, 'workspaces', 10);
        $plans->publish('growth', 1);
        $plans->createDraftVersion('growth', 2, 0);
        $plans->setModuleEntitlement('growth', 2, 'projects', true);
        $plans->setModuleEntitlement('growth', 2, 'crm', false);
        $plans->setModuleEntitlement('growth', 2, 'surveys', true);
        $plans->setLimit('growth', 2, 'workspaces', 1);
        $plans->publish('growth', 2);
        $plans->createDraftVersion('growth', 3, 30);
        $plans->setModuleEntitlement('growth', 3, 'projects', false);
        $plans->setLimit('growth', 3, 'storage_bytes', 1000);
        $plans->publish('growth', 3);

        $this->subscription = app(SubscriptionService::class)->assignInitial(
            $this->admin,
            $this->org,
            'growth',
            1,
            new CarbonImmutable('2026-05-01 00:00:00', 'UTC'),
            new CarbonImmutable('2026-07-01 00:00:00', 'UTC'),
            'initial plan',
            'pc-assign-1',
        );

        $this->forceEnable($this->ws1, 'projects');
        $this->forceEnable($this->ws1, 'crm');
    }

    public function test_preview_reports_diff_enabled_dependency_limits_and_is_side_effect_free(): void
    {
        $before = [CoreSubscription::count(), SubscriptionPeriod::count(), (int) $this->subscription->fresh()->status_version, AuditLog::count()];

        $preview = $this->previewOf($this->subscription, 'growth', 2);
        $again = $this->previewOf($this->subscription->fresh(), 'growth', 2);

        $this->assertSame($preview->confirmationToken, $again->confirmationToken, 'preview is deterministic');
        $this->assertSame(['projects'], $preview->retainedModules);
        $this->assertSame(['crm'], $preview->losingModules);
        $this->assertSame(['surveys'], $preview->gainingModules);
        $this->assertSame([(int) $this->ws1->id => ['crm']], $preview->enabledAffected);
        $this->assertSame(['crm'], $preview->dependencyImpacts['campaigns']);

        foreach ($preview->dependencyImpacts as $lostPrerequisites) {
            $this->assertSame([], array_values(array_diff($lostPrerequisites, $preview->losingModules)));
        }

        $limit = collect($preview->limits)->firstWhere('resource', 'workspaces');
        $this->assertSame(10, $limit['old']['limit_value']);
        $this->assertSame(1, $limit['new']['limit_value']);
        $this->assertSame(2, $limit['usage']);
        $this->assertSame('over_limit', $limit['status']);
        $this->assertSame(1, $limit['excess']);
        $this->assertSame(
            ['code' => 'over_limit', 'message' => 'Current usage for [workspaces] exceeds the new limit by 1; existing records are preserved and growth enforcement is deferred to later stages.'],
            collect($preview->warnings)->firstWhere('code', 'over_limit'),
        );
        $this->assertSame(7, $preview->currentPlan['grace_days']);
        $this->assertSame(0, $preview->targetPlan['grace_days']);
        $this->assertTrue($preview->confirmable());

        $this->assertSame($before, [CoreSubscription::count(), SubscriptionPeriod::count(), (int) $this->subscription->fresh()->status_version, AuditLog::count()], 'preview has zero side effects');
    }

    public function test_confirm_switches_version_keeps_expiry_recomputes_grace_and_appends_history(): void
    {
        $preview = $this->previewOf($this->subscription, 'growth', 2);
        $beforeExpiry = $this->subscription->expires_at->toIso8601String();

        $updated = app(SubscriptionService::class)->changePlan(
            $this->admin,
            $this->subscription,
            'growth',
            2,
            CarbonImmutable::parse($preview->effectiveAt),
            'move to v2',
            'pc-change-1',
            1,
            $preview->confirmationToken,
        );

        $fresh = $updated->fresh();
        $this->assertSame(2, (int) $fresh->status_version);
        $this->assertSame('growth', $fresh->planVersion->plan->key);
        $this->assertSame(2, (int) $fresh->planVersion->version);
        $this->assertSame($beforeExpiry, $fresh->expires_at->toIso8601String(), 'expiry never moves');
        $this->assertSame('2026-07-01T00:00:00+00:00', $fresh->grace_ends_at->toIso8601String(), 'grace follows the new version (0 days)');

        $history = app(SubscriptionService::class)->history($updated);
        $this->assertSame(['initial', 'plan_change'], array_map(fn (SubscriptionPeriod $p) => $p->operation, $history));

        $evaluator = app(SubscriptionEntitlementEvaluator::class);
        $this->assertSame(ModuleAccessLevel::Full, $evaluator->accessLevel($this->ws1, 'projects'));
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($this->ws1, 'crm'));
        $this->assertTrue($this->moduleRow($this->ws1, 'crm')->isEnabled(), 'activation metadata preserved — nothing auto-disabled');
    }

    public function test_unknown_usage_blocks_capping_an_unmeasurable_resource(): void
    {
        $preview = $this->previewOf($this->subscription, 'growth', 3);
        $this->assertFalse($preview->confirmable(), 'unknown storage usage blocks a finite storage cap');

        try {
            app(SubscriptionService::class)->changePlan($this->admin, $this->subscription, 'growth', 3, CarbonImmutable::parse($preview->effectiveAt), 'storage', 'pc-change-x', 1, $preview->confirmationToken);
            $this->fail('expected usage_unknown');
        } catch (SubscriptionException $exception) {
            $this->assertSame('usage_unknown', $exception->errorCode);
        }

        $this->assertSame(1, (int) $this->subscription->fresh()->planVersion->version, 'nothing changed');
    }

    public function test_downgrade_denies_immediately_but_preserves_activation_and_records(): void
    {
        $plans = app(PlanProvisioner::class);
        $plans->createPlan('solo', 'Solo', 'organization');
        $plans->createDraftVersion('solo', 1, 0);
        $plans->publish('solo', 1);

        $preview = $this->previewOf($this->subscription, 'solo', 1);
        $this->assertSame(['crm', 'projects'], $preview->losingModules);

        app(SubscriptionService::class)->changePlan($this->admin, $this->subscription, 'solo', 1, CarbonImmutable::parse($preview->effectiveAt), 'downgrade', 'pc-change-dg', 1, $preview->confirmationToken);

        $evaluator = app(SubscriptionEntitlementEvaluator::class);
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($this->ws1, 'projects'));

        $row = $this->moduleRow($this->ws1, 'projects');
        $this->assertTrue($row->isEnabled(), 'activation state is never cascade-deleted');
        $this->assertSame(2, Workspace::query()->where('organization_id', $this->org->id)->count(), 'over-limit records are preserved');
    }

    public function test_expired_subscription_is_not_revived_by_plan_change(): void
    {
        $this->travelTo(new CarbonImmutable('2026-08-01 00:00:00', 'UTC'));
        $lifecycle = app(SubscriptionLifecycle::class);
        $this->assertSame(SubscriptionState::Expired, $lifecycle->evaluate($this->subscription->fresh()));

        $preview = $this->previewOf($this->subscription->fresh(), 'growth', 2);
        $updated = app(SubscriptionService::class)->changePlan($this->admin, $this->subscription->fresh(), 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'change while expired', 'pc-change-exp', 1, $preview->confirmationToken);

        $this->assertSame('2026-07-08T00:00:00+00:00', $updated->fresh()->grace_ends_at->toIso8601String(), 'elapsed grace end is preserved — plan change never revives');
        $this->assertSame(SubscriptionState::Expired, $lifecycle->evaluate($updated->fresh()));

        $evaluator = app(SubscriptionEntitlementEvaluator::class);
        $this->assertSame(ModuleAccessLevel::ReadOnly, $evaluator->accessLevel($this->ws1, 'projects'), 'expired stays read-only');
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($this->ws1, 'crm'), 'newly unentitled module stays denied');
    }

    public function test_stale_version_and_changed_activation_invalidate_confirmation(): void
    {
        $preview = $this->previewOf($this->subscription, 'growth', 2);
        $service = app(SubscriptionService::class);

        // Changed activation state (new enabled module) -> preview stale.
        $this->forceEnable($this->ws2, 'chat');

        try {
            $service->changePlan($this->admin, $this->subscription->fresh(), 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'x', 'pc-change-stale', 1, $preview->confirmationToken);
            $this->fail('expected stale preview');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_change_preview_stale', $exception->errorCode);
        }

        // Renewal between preview and confirm -> optimistic version conflict.
        $freshPreview = $this->previewOf($this->subscription->fresh(), 'growth', 2);
        $service->renew($this->admin, $this->subscription->fresh(), new CarbonImmutable('2026-09-01 00:00:00', 'UTC'), null, 'renew first', 'pc-renew-1', 1);

        try {
            $service->changePlan($this->admin, $this->subscription->fresh(), 'growth', 2, CarbonImmutable::parse($freshPreview->effectiveAt), 'x', 'pc-change-stale2', 1, $freshPreview->confirmationToken);
            $this->fail('expected stale version');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_stale_version', $exception->errorCode);
        }
    }

    public function test_idempotent_retry_and_correlation_conflict(): void
    {
        $preview = $this->previewOf($this->subscription, 'growth', 2);
        $service = app(SubscriptionService::class);

        $first = $service->changePlan($this->admin, $this->subscription, 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'apply', 'pc-idem-1', 1, $preview->confirmationToken);
        $retry = $service->changePlan($this->admin, $first->fresh(), 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'apply', 'pc-idem-1', 999, 'whatever');
        $this->assertSame($first->id, $retry->id);
        $this->assertSame(2, SubscriptionPeriod::query()->count());

        try {
            $service->changePlan($this->admin, $first->fresh(), 'growth', 1, CarbonImmutable::parse($preview->effectiveAt), 'reuse', 'pc-idem-1', 2, 'whatever');
            $this->fail('expected correlation conflict');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_correlation_conflict', $exception->errorCode);
        }
    }

    public function test_audit_failure_rolls_back_entire_plan_change(): void
    {
        AuditLog::creating(function (): void {
            throw new \RuntimeException('simulated audit failure');
        });

        $preview = $this->previewOf($this->subscription, 'growth', 2);

        try {
            app(SubscriptionService::class)->changePlan($this->admin, $this->subscription, 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'x', 'pc-change-audit', 1, $preview->confirmationToken);
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        $fresh = $this->subscription->fresh();
        $this->assertSame(1, (int) $fresh->planVersion->version);
        $this->assertSame(1, (int) $fresh->status_version);
        $this->assertSame(1, SubscriptionPeriod::query()->count());
    }

    public function test_period_history_stays_non_overlapping_and_chronological(): void
    {
        $service = app(SubscriptionService::class);

        $p1 = $this->previewOf($this->subscription, 'growth', 2);
        $sub = $service->changePlan($this->admin, $this->subscription, 'growth', 2, CarbonImmutable::parse($p1->effectiveAt), 'to v2', 'pc-hist-1', 1, $p1->confirmationToken);
        $sub = $service->renew($this->admin, $sub, new CarbonImmutable('2026-10-01 00:00:00', 'UTC'), null, 'renew', 'pc-hist-2', 2);

        $history = $service->history($sub);
        $this->assertSame(['initial', 'plan_change', 'renewal'], array_map(fn (SubscriptionPeriod $p) => $p->operation, $history));

        $starts = array_map(fn (SubscriptionPeriod $p) => $p->effective_starts_at->getTimestamp(), $history);
        $sorted = $starts;
        sort($sorted);
        $this->assertSame($sorted, $starts, 'periods are chronological');
    }

    public function test_authorization_reason_and_unchanged_target_denials(): void
    {
        $preview = $this->previewOf($this->subscription, 'growth', 2);
        $service = app(SubscriptionService::class);

        // Org owner / workspace manager has no implicit authority.
        try {
            $service->changePlan($this->creator, $this->subscription, 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), 'x', 'pc-denied-1', 1, $preview->confirmationToken);
            $this->fail('expected forbidden');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_forbidden', $exception->errorCode);
        }

        // Empty reason rejected.
        try {
            $service->changePlan($this->admin, $this->subscription, 'growth', 2, CarbonImmutable::parse($preview->effectiveAt), '  ', 'pc-denied-2', 1, $preview->confirmationToken);
            $this->fail('expected reason_required');
        } catch (SubscriptionException $exception) {
            $this->assertSame('reason_required', $exception->errorCode);
        }

        // Same target as current is a blocking reason, never a silent no-op.
        $unchanged = $this->previewOf($this->subscription, 'growth', 1);
        $this->assertFalse($unchanged->confirmable());
        $this->assertSame('subscription_plan_unchanged', $unchanged->blockingReasons[0]['code']);
    }

    private function previewOf(CoreSubscription $subscription, string $key, int $version): PlanChangePreview
    {
        return app(PlanChangePlanner::class)->preview($subscription, $key, $version, CarbonImmutable::now('UTC'));
    }

    private function forceEnable(Workspace $workspace, string $moduleKey): void
    {
        WorkspaceModule::create([
            'workspace_id' => $workspace->id,
            'module_id' => CoreModule::query()->where('key', $moduleKey)->sole()->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
            'enabled_at' => now(),
            'enabled_by_user_id' => $this->creator->id,
        ]);
    }

    private function moduleRow(Workspace $workspace, string $moduleKey): WorkspaceModule
    {
        return WorkspaceModule::query()
            ->where('workspace_id', $workspace->id)
            ->where('module_id', CoreModule::query()->where('key', $moduleKey)->sole()->id)
            ->sole();
    }

    private function platformAdmin(): User
    {
        $user = User::factory()->create(['username' => 'pc_admin', 'status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $user;
    }
}
