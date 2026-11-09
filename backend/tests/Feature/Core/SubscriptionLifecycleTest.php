<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedRole;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Subscriptions\SubscriptionState;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C5-2 — subscription ownership, lifecycle evaluation,
 * manual platform provisioning/renewal, idempotency, and
 * fail-closed boundaries. No runtime entitlement integration yet
 * (C5-3): the C4 gate behavior must not change here.
 */
class SubscriptionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('team', 'Team', 'organization');
        $plans->createDraftVersion('team', 1, 7);
        $plans->setModuleEntitlement('team', 1, 'projects', true);
        $plans->publish('team', 1);
        $plans->createPlan('solo', 'Solo', 'personal');
        $plans->createDraftVersion('solo', 1, 0);
        $plans->publish('solo', 1);

        $this->admin = $this->platformAdmin();
    }

    public function test_organization_and_personal_assignment_and_resolution(): void
    {
        [$creator, $organization, $workspace] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);

        // Nothing exists until a platform administrator assigns it.
        $this->assertNull($service->currentForWorkspace($workspace));
        $this->assertSame(SubscriptionState::Missing, $service->snapshotForWorkspace($workspace)->state);

        $subscription = $service->assignInitial(
            $this->admin,
            $organization,
            'team',
            1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'),
            CarbonImmutable::parse('2027-01-01T00:00:00Z'),
            'Initial provisioning',
            'assign-org-1',
        );

        $this->assertSame('org:'.$organization->id, $subscription->ownerKey());
        $this->assertSame($subscription->id, $service->currentForWorkspace($workspace)?->id);
        $this->assertSame('2027-01-08T00:00:00+00:00', $subscription->grace_ends_at->toIso8601String(), 'Grace end = expiry + published version grace (7d).');

        $snapshot = $service->snapshotForWorkspace($workspace, CarbonImmutable::parse('2026-06-01T00:00:00Z'));
        $this->assertSame(SubscriptionState::Active, $snapshot->state);
        $this->assertTrue($snapshot->plan->allowsModule('projects'));

        // Personal workspace of the SAME user borrows nothing.
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);
        $this->assertSame(SubscriptionState::Missing, $service->snapshotForWorkspace($personal)->state);

        $personalSub = $service->assignInitial(
            $this->admin,
            $personal,
            'solo',
            1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'),
            CarbonImmutable::parse('2027-01-01T00:00:00Z'),
            'Personal provisioning',
            'assign-personal-1',
        );
        $this->assertSame('ws:'.$personal->id, $personalSub->ownerKey());
        $this->assertSame($personalSub->id, $service->currentForWorkspace($personal)?->id);
    }

    public function test_cross_scope_claims_and_invalid_owners_are_rejected(): void
    {
        [$creator, $organization, $workspace] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);
        $personalSub = $service->assignInitial($this->admin, $personal, 'solo', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2027-01-01T00:00:00Z'), 'r', 'corr-p');

        $resolver = app(SubscriptionOwnerResolver::class);
        $this->expectSubscription('subscription_owner_mismatch', fn () => $resolver->assertBelongsToWorkspace($personalSub, $workspace));
        $this->expectSubscription('subscription_owner_invalid', fn () => $resolver->subscriptionForPersonalWorkspace($workspace));
        // An organization-owned workspace is not a personal owner.
        $this->expectSubscription('subscription_owner_invalid', fn () => $service->assignInitial($this->admin, $workspace, 'solo', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2027-01-01T00:00:00Z'), 'r', 'corr-x'));
    }

    public function test_assignment_validation_fail_closed(): void
    {
        [, $organization] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $start = CarbonImmutable::parse('2026-01-01T00:00:00Z');
        $end = CarbonImmutable::parse('2027-01-01T00:00:00Z');

        // Audience mismatch, unpublished version, bad window, no reason.
        $this->expectSubscription('subscription_plan_mismatch', fn () => $service->assignInitial($this->admin, $organization, 'solo', 1, $start, $end, 'r', 'c1'));
        app(PlanProvisioner::class)->createPlan('drafty', 'Drafty', 'organization');
        app(PlanProvisioner::class)->createDraftVersion('drafty', 1);
        $this->expectSubscription('plan_version_not_published', fn () => $service->assignInitial($this->admin, $organization, 'drafty', 1, $start, $end, 'r', 'c2'));
        $this->expectSubscription('subscription_period_invalid', fn () => $service->assignInitial($this->admin, $organization, 'team', 1, $end, $start, 'r', 'c3'));
        $this->expectSubscription('reason_required', fn () => $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, '  ', 'c4'));
        $this->assertSame(0, CoreSubscription::count());
    }

    public function test_duplicate_assignment_and_idempotent_retry(): void
    {
        [, $organization] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $start = CarbonImmutable::parse('2026-01-01T00:00:00Z');
        $end = CarbonImmutable::parse('2027-01-01T00:00:00Z');

        $first = $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'r', 'corr-1');
        $retry = $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'r', 'corr-1');
        $this->assertSame($first->id, $retry->id);
        $this->assertSame(1, SubscriptionPeriod::count());

        $this->expectSubscription('subscription_exists', fn () => $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'r', 'corr-2'));
        $this->assertSame(1, CoreSubscription::count());
    }

    public function test_lifecycle_boundaries_are_exact(): void
    {
        $subscription = CoreSubscription::create([
            'organization_id' => $this->organizationWorkspace()[1]->id,
            'plan_version_id' => $this->publishedVersionId('team', 1),
            'starts_at' => '2030-01-01T00:00:00Z',
            'expires_at' => '2030-02-01T00:00:00Z',
            'grace_ends_at' => '2030-02-08T00:00:00Z',
            'status_version' => 1,
        ]);
        $lifecycle = app(SubscriptionLifecycle::class);
        $at = fn (string $time): SubscriptionState => $lifecycle->evaluate($subscription, CarbonImmutable::parse($time));

        $this->assertSame(SubscriptionState::NotStarted, $at('2029-12-31T23:59:59Z'));
        $this->assertSame(SubscriptionState::Active, $at('2030-01-01T00:00:00Z'));
        $this->assertSame(SubscriptionState::Active, $at('2030-01-31T23:59:59Z'));
        $this->assertSame(SubscriptionState::Grace, $at('2030-02-01T00:00:00Z'), 'Expiry instant enters grace.');
        $this->assertSame(SubscriptionState::Grace, $at('2030-02-07T23:59:59Z'));
        $this->assertSame(SubscriptionState::Expired, $at('2030-02-08T00:00:00Z'), 'Grace-end instant is expired.');
        $this->assertSame(SubscriptionState::Missing, $lifecycle->evaluate(null));
    }

    public function test_zero_grace_expires_exactly_at_expiry_and_invalid_state_denies(): void
    {
        [, $organization] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault(User::factory()->create(['status' => 'active']));
        $service->assignInitial($this->admin, $personal, 'solo', 1,
            CarbonImmutable::parse('2030-01-01T00:00:00Z'), CarbonImmutable::parse('2030-02-01T00:00:00Z'), 'r', 'corr-zero');

        $lifecycle = app(SubscriptionLifecycle::class);
        $sub = $service->currentForWorkspace($personal);
        $this->assertSame(SubscriptionState::Active, $lifecycle->evaluate($sub, CarbonImmutable::parse('2030-01-31T23:59:59Z')));
        $this->assertSame(SubscriptionState::Expired, $lifecycle->evaluate($sub, CarbonImmutable::parse('2030-02-01T00:00:00Z')), 'Zero grace: no grace window at all.');

        $corrupt = CoreSubscription::create([
            'organization_id' => $organization->id,
            'plan_version_id' => $this->publishedVersionId('team', 1),
            'starts_at' => '2030-02-01T00:00:00Z',
            'expires_at' => '2030-01-01T00:00:00Z',
            'grace_ends_at' => '2030-01-01T00:00:00Z',
            'status_version' => 1,
        ]);
        $this->assertSame(SubscriptionState::Invalid, $lifecycle->evaluate($corrupt, CarbonImmutable::parse('2030-01-15T00:00:00Z')));
    }

    public function test_renewal_rules_extend_restart_idempotency_and_versioning(): void
    {
        [, $organization, $workspace] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $subscription = $service->assignInitial($this->admin, $organization, 'team', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2026-07-01T00:00:00Z'), 'initial', 'corr-init');

        $this->travelTo(CarbonImmutable::parse('2026-03-01T00:00:00Z'));

        // Stale optimistic version rejected.
        $this->expectSubscription('subscription_stale_version', fn () => $service->renew(
            $this->admin, $subscription, CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-r0', 99));

        $renewed = $service->renew($this->admin, $subscription, CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-r1', 1);
        $this->assertSame(2, (int) $renewed->status_version);
        $this->assertSame('2027-07-01T00:00:00+00:00', $renewed->expires_at->toIso8601String());
        $this->assertSame('2027-07-08T00:00:00+00:00', $renewed->grace_ends_at->toIso8601String());

        $periods = $service->history($renewed);
        $this->assertCount(2, $periods);
        $this->assertSame(SubscriptionPeriod::OPERATION_RENEWAL, $periods[1]->operation);
        $this->assertSame('2026-07-01T00:00:00+00:00', $periods[1]->effective_starts_at->toIso8601String(), 'Active renewal extends from the old expiration boundary.');

        // Idempotent retry: no third period, no version bump.
        $service->renew($this->admin, $subscription, CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-r1', 1);
        $this->assertSame(2, SubscriptionPeriod::count());
        $this->assertSame(2, (int) $renewed->fresh()->status_version);

        // Period history is immutable.
        $this->expectSubscription('subscription_period_immutable', function () use ($periods): void {
            $periods[0]->forceFill(['reason' => 'tampered'])->save();
        });

        $this->assertTrue(AuditLog::query()->where('action', 'subscription.assigned')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'subscription.renewed')->exists());
    }

    public function test_renewal_after_expiry_requires_explicit_non_fabricated_start(): void
    {
        [, $organization] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $subscription = $service->assignInitial($this->admin, $organization, 'team', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2026-07-01T00:00:00Z'), 'initial', 'corr-init');

        $this->travelTo(CarbonImmutable::parse('2026-09-01T00:00:00Z')); // past grace (2026-07-08)

        $this->expectSubscription('subscription_period_invalid', fn () => $service->renew(
            $this->admin, $subscription, CarbonImmutable::parse('2027-09-01T00:00:00Z'), null, 'renew', 'corr-e1', 1));
        $this->expectSubscription('subscription_period_invalid', fn () => $service->renew(
            $this->admin, $subscription, CarbonImmutable::parse('2027-09-01T00:00:00Z'), CarbonImmutable::parse('2026-08-15T00:00:00Z'), 'renew', 'corr-e2', 1));

        // Snapshot after expiry (pre-renewal) still carries the
        // last valid published plan for C5-3 read-only evaluation.
        $snapshot = $service->snapshotForWorkspace(
            $organization->workspaces()->where('is_default', true)->firstOrFail(),
            CarbonImmutable::parse('2026-08-01T00:00:00Z'),
        );
        $this->assertSame(SubscriptionState::Expired, $snapshot->state);
        $this->assertTrue($snapshot->plan->allowsModule('projects'));

        $renewed = $service->renew($this->admin, $subscription, CarbonImmutable::parse('2027-09-01T00:00:00Z'),
            CarbonImmutable::parse('2026-09-01T00:00:00Z'), 'renew', 'corr-e3', 1);
        $this->assertSame('2026-09-01T00:00:00+00:00', $renewed->starts_at->toIso8601String());
    }

    public function test_only_platform_permission_holders_may_provision(): void
    {
        [$creator, $organization] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $start = CarbonImmutable::parse('2026-01-01T00:00:00Z');
        $end = CarbonImmutable::parse('2027-01-01T00:00:00Z');

        // Workspace/organization manager: no implicit authority.
        $this->expectSubscription('subscription_forbidden', fn () => $service->assignInitial($creator, $organization, 'team', 1, $start, $end, 'r', 'c-mgr'));

        // Suspended platform administrator: no authority.
        $suspendedAdmin = $this->platformAdmin();
        $suspendedAdmin->forceFill(['status' => 'suspended'])->save();
        $this->expectSubscription('subscription_forbidden', fn () => $service->assignInitial($suspendedAdmin, $organization, 'team', 1, $start, $end, 'r', 'c-sus'));
    }

    public function test_audit_failure_rolls_back_assignment_and_no_side_effects_occur(): void
    {
        [, $organization, $workspace] = $this->organizationWorkspace();
        $service = app(SubscriptionService::class);
        $rolesBefore = ScopedRole::count();

        AuditLog::creating(function (): void {
            throw new \RuntimeException('audit unavailable');
        });

        try {
            $service->assignInitial($this->admin, $organization, 'team', 1,
                CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2027-01-01T00:00:00Z'), 'r', 'corr-fail');
            $this->fail('Assignment must roll back when the audit write fails.');
        } catch (\RuntimeException) {
            $this->assertSame(0, CoreSubscription::count());
            $this->assertSame(0, SubscriptionPeriod::count());
        }

        AuditLog::flushEventListeners();

        $service->assignInitial($this->admin, $organization, 'team', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2027-01-01T00:00:00Z'), 'r', 'corr-ok');
        // No module activation, no RBAC changes — ever.
        $this->assertSame(0, WorkspaceModule::count());
        $this->assertSame($rolesBefore, ScopedRole::count());
    }

    private function expectSubscription(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Subscription operation must be rejected with [{$code}].");
        } catch (SubscriptionException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }

    private function publishedVersionId(string $planKey, int $version): int
    {
        return (int) \App\Core\Plans\CorePlanVersion::query()
            ->whereHas('plan', fn ($query) => $query->where('key', $planKey))
            ->where('version', $version)
            ->value('id');
    }

    private function platformAdmin(): User
    {
        PermissionCatalog::sync();
        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $user;
    }

    /** @return array{0: User, 1: Organization, 2: Workspace} */
    private function organizationWorkspace(): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$creator, $organization, $workspace];
    }
}
