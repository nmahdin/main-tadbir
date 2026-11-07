<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Modules\ModuleAccessDeniedException;
use App\Core\Modules\ModuleAccessGuard;
use App\Core\Modules\ModuleActivationException;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleOperation;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\OrganizationModulePolicy;
use App\Core\Modules\CoreModule;
use App\Core\Modules\WorkspaceModule;
use App\Core\Modules\WorkspaceModuleService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\Contracts\SubscriptionAccessEvaluator;
use App\Core\Plans\ModuleAccessLevel;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionEntitlementEvaluator;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C5-3 — production subscription entitlement evaluation,
 * operation-aware guard enforcement, and C4 activation integration.
 * All fixtures are REAL versioned plans/subscriptions provisioned
 * through the C5-1/C5-2 services; no entitlement doubles anywhere.
 */
class SubscriptionEntitlementEvaluatorTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('eval-org', 'Eval Org', 'organization');
        $plans->createDraftVersion('eval-org', 1, 7);
        $plans->setModuleEntitlement('eval-org', 1, 'projects', true);
        $plans->publish('eval-org', 1);
        $plans->createPlan('eval-personal', 'Eval Personal', 'personal');
        $plans->createDraftVersion('eval-personal', 1, 7);
        $plans->setModuleEntitlement('eval-personal', 1, 'projects', true);
        $plans->publish('eval-personal', 1);
        $plans->createPlan('eval-empty', 'Eval Empty', 'personal');
        $plans->createDraftVersion('eval-empty', 1, 0);
        $plans->setModuleEntitlement('eval-empty', 1, 'projects', false);
        $plans->publish('eval-empty', 1);

        $this->admin = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $this->admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);
    }

    public function test_organization_subscription_covers_all_org_workspaces_but_not_personal(): void
    {
        [$creator, $organization] = $this->organization();
        $workspaceA = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $workspaceB = $organization->workspaces()->create([
            'name' => 'Second', 'is_default' => false, 'status' => 'active',
        ]);

        $this->assign($organization, 'eval-org', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        $evaluator = app(SubscriptionAccessEvaluator::class);

        $this->travelTo(CarbonImmutable::parse('2026-06-01T00:00:00Z'));
        $this->assertSame(ModuleAccessLevel::Full, $evaluator->accessLevel($workspaceA, 'projects'));
        $this->assertSame(ModuleAccessLevel::Full, $evaluator->accessLevel($workspaceB->fresh(), 'projects'));

        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($personal, 'projects'), 'Personal workspace never borrows the organization subscription.');
    }

    public function test_active_grace_expired_levels_and_exact_boundaries(): void
    {
        [, $workspace] = $this->personal();
        $this->assign($workspace, 'eval-personal', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z'); // grace until 2026-07-08
        $evaluator = app(SubscriptionAccessEvaluator::class);
        $level = fn (string $at): ModuleAccessLevel => tap($evaluator, fn () => $this->travelTo(CarbonImmutable::parse($at)))->accessLevel($workspace, 'projects');

        $this->assertSame(ModuleAccessLevel::Full, $level('2026-06-30T23:59:59Z'), 'Immediately before expiry: Full.');
        $this->assertSame(ModuleAccessLevel::Grace, $level('2026-07-01T00:00:00Z'), 'Exactly at expiry: Grace.');
        $this->assertSame(ModuleAccessLevel::Grace, $level('2026-07-04T12:00:00Z'), 'Mid-grace: Grace.');
        $this->assertSame(ModuleAccessLevel::Grace, $level('2026-07-07T23:59:59Z'), 'Immediately before grace end: Grace.');
        $this->assertSame(ModuleAccessLevel::ReadOnly, $level('2026-07-08T00:00:00Z'), 'Exactly at grace end: ReadOnly.');
        $this->assertSame(ModuleAccessLevel::ReadOnly, $level('2026-12-01T00:00:00Z'));
        $this->assertFalse($evaluator->canActivate($workspace, 'projects'), 'Expired subscriptions cannot activate.');
    }

    public function test_missing_not_started_unentitled_unknown_and_unavailable_are_denied(): void
    {
        [, $workspace] = $this->personal();
        $evaluator = app(SubscriptionAccessEvaluator::class);
        $this->travelTo(CarbonImmutable::parse('2026-06-01T00:00:00Z'));

        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace, 'projects'), 'Missing subscription denies.');

        $this->assign($workspace, 'eval-personal', '2027-01-01T00:00:00Z', '2028-01-01T00:00:00Z');
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace, 'projects'), 'NotStarted denies.');
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace, 'not-a-module'), 'Unknown module denies.');
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace, 'tasks'), 'Unentitled + unavailable module denies.');
    }

    public function test_explicit_plan_denial_and_corrupt_history_never_earn_read_only(): void
    {
        [, $workspace] = $this->personal();
        $evaluator = app(SubscriptionAccessEvaluator::class);

        // Plan explicitly denies projects (is_allowed=false).
        $this->assign($workspace, 'eval-empty', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z');
        $this->travelTo(CarbonImmutable::parse('2026-06-01T00:00:00Z'));
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace, 'projects'));

        // Corrupt fixture: an expired subscription row with NO
        // recorded periods earns nothing, and neither does an
        // internally inconsistent window.
        [, $workspace2] = $this->personal();
        DB::table('core_subscriptions')->insert([
            'personal_workspace_id' => $workspace2->id,
            'plan_version_id' => $this->versionId('eval-personal', 1),
            'starts_at' => '2026-01-01 00:00:00',
            'expires_at' => '2026-07-01 00:00:00',
            'grace_ends_at' => '2026-07-08 00:00:00',
            'status_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame(ModuleAccessLevel::Denied, $evaluator->accessLevel($workspace2, 'projects'), 'Expired row without period evidence denies.');
    }

    public function test_guard_enforces_read_only_and_module_state_precedence(): void
    {
        [$owner, $workspace] = $this->personal();
        $this->assign($workspace, 'eval-personal', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z');
        $this->forceEnable($workspace, 'projects', $owner);
        $guard = app(ModuleAccessGuard::class);
        $context = fn () => app(\App\Core\Authorization\AuthorizationService::class)->resolveContext($owner, $workspace->id);

        $this->travelTo(CarbonImmutable::parse('2026-08-01T00:00:00Z')); // expired
        $guard->assertOperational($context(), 'projects', ModuleOperation::Read);
        $this->assertReadOnlyDenied(fn () => $guard->assertOperational($context(), 'projects', ModuleOperation::Write));
        $this->assertReadOnlyDenied(fn () => $guard->assertOperational($context(), 'projects', ModuleOperation::Execute));

        // Disabled module: even legitimate expired reads are denied.
        app(WorkspaceModuleService::class)->deactivate($owner, $workspace, 'projects');
        try {
            $guard->assertOperational($context(), 'projects', ModuleOperation::Read);
            $this->fail('Disabled module must deny even read-only access.');
        } catch (ModuleAccessDeniedException $exception) {
            $this->assertSame(ModuleAccessDeniedException::MODULE_NOT_ENABLED, $exception->reason());
        }

        // Direct domain-service style write path (guard) stays denied.
        $this->forceEnable($workspace, 'projects', $owner);
        $this->assertReadOnlyDenied(fn () => $guard->authorize($owner, $workspace->id, 'workspace.view', 'projects', ModuleOperation::Write));
    }

    public function test_organization_policy_and_suspension_outrank_subscription(): void
    {
        [$creator, $organization, $workspace] = $this->organization(true);
        $this->assign($organization, 'eval-org', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
        $this->forceEnable($workspace, 'projects', $creator);
        $guard = app(ModuleAccessGuard::class);
        $this->travelTo(CarbonImmutable::parse('2026-06-01T00:00:00Z'));

        OrganizationModulePolicy::create([
            'organization_id' => $organization->id,
            'module_id' => CoreModule::query()->where('key', 'projects')->sole()->id,
            'policy' => OrganizationModulePolicy::POLICY_DENIED,
        ]);
        try {
            $guard->authorize($creator, $workspace->id, 'workspace.view', 'projects', ModuleOperation::Read);
            $this->fail('Explicit organization policy deny must outrank subscription.');
        } catch (ModuleAccessDeniedException $exception) {
            $this->assertSame(ModuleAccessDeniedException::ORGANIZATION_POLICY_DENIED, $exception->reason());
        }
        OrganizationModulePolicy::query()->delete();

        // Suspended organization: context resolution denies before
        // any subscription evaluation happens.
        $organization->forceFill(['status' => 'suspended'])->save();
        try {
            $guard->authorize($creator, $workspace->id, 'workspace.view', 'projects', ModuleOperation::Read);
            $this->fail('Suspended organization must deny regardless of subscription.');
        } catch (AuthorizationDeniedException $exception) {
            $this->assertSame(AuthorizationDeniedException::ORGANIZATION_UNAVAILABLE, $exception->reason());
        }
    }

    public function test_activation_blocked_after_expiry_and_stale_after_subscription_change(): void
    {
        [$owner, $workspace] = $this->personal();
        $subscription = $this->assign($workspace, 'eval-personal', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z');
        $service = app(WorkspaceModuleService::class);
        $planner = app(ModuleActivationPlanner::class);

        $this->travelTo(CarbonImmutable::parse('2026-03-01T00:00:00Z'));
        $preview = $planner->preview($workspace, 'projects');
        $this->assertTrue($preview->confirmable());

        // Subscription lapses past grace between preview and confirm.
        $this->travelTo(CarbonImmutable::parse('2026-08-01T00:00:00Z'));
        try {
            $service->activate($owner, $workspace, 'projects', $preview->confirmationToken);
            $this->fail('Stale confirmation after subscription expiry must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertContains($exception->errorCode, ['module_activation_preview_stale', 'entitlement_missing']);
            $this->assertSame(0, WorkspaceModule::count());
        }

        // Fresh activation after expiry is blocked, closure included.
        $expiredPreview = $planner->preview($workspace, 'events');
        $this->assertContains('entitlement_missing', $expiredPreview->blockingCodes());

        // Renewal restores activation eligibility WITHOUT enabling
        // anything by itself.
        app(SubscriptionService::class)->renew($this->admin, $subscription,
            CarbonImmutable::parse('2027-09-01T00:00:00Z'), CarbonImmutable::parse('2026-08-01T00:00:00Z'), 'renewal', 'corr-renew-1', 1);
        $this->assertSame(0, WorkspaceModule::count(), 'Renewal must never auto-enable modules.');
        $fresh = $planner->preview($workspace, 'projects');
        $this->assertSame(['projects'], $service->activate($owner, $workspace, 'projects', $fresh->confirmationToken));
        $this->assertTrue(AuditLog::query()->where('action', 'subscription.renewed')->exists());
    }

    private function assertReadOnlyDenied(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Operation must be denied as read-only.');
        } catch (ModuleAccessDeniedException $exception) {
            $this->assertSame(ModuleAccessDeniedException::MODULE_READ_ONLY, $exception->reason());
        }
    }

    private function assign(Organization|Workspace $owner, string $planKey, string $starts, string $expires): CoreSubscription
    {
        return app(SubscriptionService::class)->assignInitial($this->admin, $owner, $planKey, 1,
            CarbonImmutable::parse($starts), CarbonImmutable::parse($expires), 'evaluator fixture', 'corr-'.uniqid());
    }

    private function forceEnable(Workspace $workspace, string $moduleKey, User $actor): void
    {
        WorkspaceModule::updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'module_id' => CoreModule::query()->where('key', $moduleKey)->sole()->id,
            ],
            [
                'status' => WorkspaceModule::STATUS_ENABLED,
                'enabled_at' => now(),
                'enabled_by_user_id' => $actor->id,
                'disabled_at' => null,
                'disabled_by_user_id' => null,
            ],
        );
    }

    private function versionId(string $planKey, int $version): int
    {
        return (int) \App\Core\Plans\CorePlanVersion::query()
            ->whereHas('plan', fn ($query) => $query->where('key', $planKey))
            ->where('version', $version)
            ->value('id');
    }

    /** @return array{0: User, 1: Workspace} */
    private function personal(): array
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        return [$owner, $workspace];
    }

    /** @return array{0: User, 1: Organization, 2: Workspace} */
    private function organization(bool $withWorkspace = false): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$creator, $organization, $workspace];
    }
}
