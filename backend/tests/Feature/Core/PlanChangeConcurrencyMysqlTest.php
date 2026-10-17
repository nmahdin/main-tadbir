<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\PlanChangePlanner;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionService;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only plan-change concurrency evidence (Stage C5-4).
 *
 * Plan-change confirmation locks the owner (organization) row and
 * then the subscription row — the documented C5-2 order. A
 * concurrent confirmation or renewal therefore serializes: the
 * loser blocks on the lock, and once the winner commits, the
 * loser's optimistic version / preview token is stale. Committed
 * postconditions: exactly one `plan_change` period and one version
 * increment per authorized change.
 */
class PlanChangeConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $organizationIds = [];

    /** @var list<int> */
    private array $workspaceIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise row locks).');
        }

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');
        $this->travelTo(CarbonImmutable::parse('2026-06-01T12:00:00Z'));
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);

        if (CorePlan::query()->where('key', 'race-growth')->doesntExist()) {
            $plans->createPlan('race-growth', 'Race Growth', 'organization');
            $plans->createDraftVersion('race-growth', 1, 7);
            $plans->setModuleEntitlement('race-growth', 1, 'projects', true);
            $plans->publish('race-growth', 1);
            $plans->createDraftVersion('race-growth', 2, 0);
            $plans->setModuleEntitlement('race-growth', 2, 'projects', true);
            $plans->setModuleEntitlement('race-growth', 2, 'crm', true);
            $plans->publish('race-growth', 2);
        }
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $subscriptionIds = DB::table('core_subscriptions')->whereIn('organization_id', $this->organizationIds)->pluck('id')->all();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('core_subscription_periods')->whereIn('subscription_id', $subscriptionIds)->delete();
            DB::table('core_subscriptions')->whereIn('id', $subscriptionIds)->delete();
            DB::table('workspace_modules')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
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

    public function test_concurrent_plan_change_confirmations_serialize_and_loser_goes_stale(): void
    {
        [$admin, $organization, $subscription] = $this->fixture('pc-race-1');
        $preview = app(PlanChangePlanner::class)->preview($subscription, 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'));

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner holds the documented lock order (organization
            // row, then subscription row) mid-confirmation.
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('core_subscriptions')->where('id', $subscription->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                app(SubscriptionService::class)->changePlan($admin, $subscription, 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'), 'loser', 'pc-race-1-loser', 1, $preview->confirmationToken);
                $this->fail('Confirmation must block on the owner lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            // Winner completes its own change and commits.
            $v2 = CorePlan::query()->where('key', 'race-growth')->first()->versions()->where('version', 2)->first();
            $winner->table('core_subscriptions')->where('id', $subscription->id)->update([
                'plan_version_id' => $v2->id, 'status_version' => 2, 'grace_ends_at' => '2026-07-01 00:00:00',
            ]);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // Loser retries after the winner commits: stale.
        try {
            app(SubscriptionService::class)->changePlan($admin, $subscription->fresh(), 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'), 'loser retry', 'pc-race-1-loser2', 1, $preview->confirmationToken);
            $this->fail('Stale confirmation must be rejected.');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_stale_version', $exception->errorCode);
        }

        $this->assertSame(0, DB::table('core_subscription_periods')->where('subscription_id', $subscription->id)->where('operation', 'plan_change')->count());
        $this->assertSame(2, (int) $subscription->fresh()->status_version);
    }

    public function test_renewal_and_plan_change_serialize_on_the_owner_lock(): void
    {
        [$admin, $organization, $subscription] = $this->fixture('pc-race-2');
        $service = app(SubscriptionService::class);
        $preview = app(PlanChangePlanner::class)->preview($subscription, 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'));

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner (renewal side) holds the owner row and applies
            // a committed renewal effect.
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $service->changePlan($admin, $subscription, 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'), 'blocked change', 'pc-race-2-change', 1, $preview->confirmationToken);
                $this->fail('Plan change must block on the owner lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            $winner->table('core_subscriptions')->where('id', $subscription->id)->update([
                'expires_at' => '2026-12-01 00:00:00', 'grace_ends_at' => '2026-12-08 00:00:00', 'status_version' => 2,
            ]);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // After the renewal, the pre-renewal preview is stale...
        try {
            $service->changePlan($admin, $subscription->fresh(), 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'), 'change', 'pc-race-2-change2', 1, $preview->confirmationToken);
            $this->fail('Pre-renewal preview must be stale after renewal.');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_stale_version', $exception->errorCode);
        }

        // ...but a fresh preview confirms cleanly.
        $freshPreview = app(PlanChangePlanner::class)->preview($subscription->fresh(), 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'));
        $service->changePlan($admin, $subscription->fresh(), 'race-growth', 2, CarbonImmutable::parse('2026-06-01T12:00:00Z'), 'change', 'pc-race-2-change3', 2, $freshPreview->confirmationToken);

        $fresh = $subscription->fresh();
        $this->assertSame(3, (int) $fresh->status_version);
        $this->assertSame('2026-12-01T00:00:00+00:00', $fresh->expires_at->toIso8601String(), 'renewal expiry is preserved by the later plan change');
        $this->assertSame(1, DB::table('core_subscription_periods')->where('subscription_id', $subscription->id)->where('operation', 'plan_change')->count());
    }

    /**
     * @return array{0: User, 1: \App\Core\Organizations\Organization, 2: \App\Core\Subscriptions\CoreSubscription}
     */
    private function fixture(string $correlation): array
    {
        $admin = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $admin->id;
        PlatformRoleAssignment::create([
            'user_id' => $admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        $creator = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $creator->id;
        $organization = app(\App\Core\Organizations\OrganizationProvisioner::class)->create($creator, 'Race Org '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->workspaceIds[] = (int) $workspace->id;

        $subscription = app(SubscriptionService::class)->assignInitial(
            $admin,
            $organization,
            'race-growth',
            1,
            CarbonImmutable::parse('2026-05-01T00:00:00Z'),
            CarbonImmutable::parse('2026-07-01T00:00:00Z'),
            'initial',
            $correlation,
        );

        return [$admin, $organization, $subscription];
    }
}
