<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionService;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only competing-write evidence for Stage C5-2.
 *
 * Subscription writers take the OWNER row lock before the
 * subscription row lock, so: (a) two attempts to create the first
 * subscription for one owner serialize — exactly one current
 * subscription exists afterwards (backstopped by the generated
 * owner_key unique index, NOT a nullable composite unique);
 * (b) concurrent renewals serialize, the loser observing the
 * committed version and respecting the optimistic check once it
 * proceeds; (c) independent owners never block each other.
 * Committed postconditions are asserted throughout.
 */
class SubscriptionConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $organizationIds = [];

    /** @var list<int> */
    private array $workspaceIds = [];

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise row locks).');
        }

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        if (\App\Core\Plans\CorePlan::query()->where('key', 'team')->doesntExist()) {
            $plans->createPlan('team', 'Team', 'organization');
            $plans->createDraftVersion('team', 1, 7);
            $plans->publish('team', 1);
        }

        $this->admin = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $this->admin->id;
        PlatformRoleAssignment::create([
            'user_id' => $this->admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $subscriptionIds = DB::table('core_subscriptions')
                ->whereIn('organization_id', $this->organizationIds)
                ->orWhereIn('personal_workspace_id', $this->workspaceIds)
                ->pluck('id')->all();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('core_subscription_periods')->whereIn('subscription_id', $subscriptionIds)->delete();
            DB::table('core_subscriptions')->whereIn('id', $subscriptionIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            $roleIds = DB::table('core_roles')
                ->whereIn('workspace_id', $this->workspaceIds)
                ->orWhereIn('organization_id', $this->organizationIds)
                ->pluck('id')->all();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $this->workspaceIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_competing_first_assignments_serialize_to_exactly_one_subscription(): void
    {
        [$organization] = $this->organization();
        $service = app(SubscriptionService::class);
        $start = CarbonImmutable::parse('2026-01-01T00:00:00Z');
        $end = CarbonImmutable::parse('2027-01-01T00:00:00Z');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner holds the owner (organization) row lock.
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();

            $this->assertBlocked(fn () => $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'race', 'corr-race'));
        } finally {
            $winner->rollBack();
        }

        $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'race', 'corr-race');

        // A later competing assignment is rejected; state stays singular.
        try {
            $service->assignInitial($this->admin, $organization, 'team', 1, $start, $end, 'race', 'corr-other');
            $this->fail('Second assignment for the same owner must be rejected.');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_exists', $exception->errorCode);
        }

        $this->assertSame(1, DB::table('core_subscriptions')->where('organization_id', $organization->id)->count());
        $this->assertSame(1, DB::table('core_subscription_periods')->count());
    }

    public function test_concurrent_renewals_serialize_and_respect_optimistic_version(): void
    {
        [$organization] = $this->organization();
        $service = app(SubscriptionService::class);
        $subscription = $service->assignInitial($this->admin, $organization, 'team', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2026-07-01T00:00:00Z'), 'initial', 'corr-init');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('core_subscriptions')->where('id', $subscription->id)->lockForUpdate()->first();
            // Winner applies its renewal (version 1 -> 2), uncommitted.
            $winner->table('core_subscriptions')->where('id', $subscription->id)->update([
                'expires_at' => '2027-01-01 00:00:00', 'grace_ends_at' => '2027-01-08 00:00:00', 'status_version' => 2,
            ]);

            $this->assertBlocked(fn () => $service->renew(
                $this->admin, $subscription, CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-loser', 1));
        } finally {
            $winner->commit();
        }

        // The blocked renewal now observes version 2: the stale
        // expectation is rejected, the fresh one succeeds.
        try {
            $service->renew($this->admin, $subscription, CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-loser', 1);
            $this->fail('Stale optimistic version must be rejected after the competing renewal commits.');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_stale_version', $exception->errorCode);
        }

        $renewed = $service->renew($this->admin, $subscription->fresh(), CarbonImmutable::parse('2027-07-01T00:00:00Z'), null, 'renew', 'corr-loser', 2);
        $this->assertSame(3, (int) $renewed->status_version);
        $this->assertSame(1, DB::table('core_subscription_periods')
            ->where('subscription_id', $subscription->id)
            ->where('correlation_id', 'corr-loser')
            ->count(), 'The retried renewal recorded exactly one period.');
    }

    public function test_independent_owners_do_not_block_each_other(): void
    {
        [$orgA] = $this->organization();
        [$orgB] = $this->organization();
        $service = app(SubscriptionService::class);
        $start = CarbonImmutable::parse('2026-01-01T00:00:00Z');
        $end = CarbonImmutable::parse('2027-01-01T00:00:00Z');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $orgA->id)->lockForUpdate()->first();

            // Owner B proceeds immediately (short lock timeout proves no block).
            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $service->assignInitial($this->admin, $orgB, 'team', 1, $start, $end, 'independent', 'corr-b');
            } finally {
                DB::statement('SET SESSION innodb_lock_wait_timeout = 50');
            }
        } finally {
            $winner->rollBack();
        }

        $this->assertSame(1, DB::table('core_subscriptions')->where('organization_id', $orgB->id)->count());
    }

    /** @return array{0: \App\Core\Organizations\Organization} */
    private function organization(): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $creator->id;
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Race Org '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->workspaceIds[] = (int) $workspace->id;

        return [$organization];
    }

    private function assertBlocked(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');

        try {
            $attempt();
            $this->fail('Operation must block on the competing lock.');
        } catch (QueryException $exception) {
            $this->assertSame(1205, (int) ($exception->errorInfo[1] ?? 0), $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = 50');
        }
    }
}
