<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleActivationException;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModuleService;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only mutation-boundary evidence for Stage C5-3.
 *
 * Activation locks the workspace row first; a personal-workspace
 * subscription renewal locks the same owner (workspace) row. A
 * renewal that expires the subscription mid-activation therefore
 * serializes with the activation: once the renewal commits, the
 * blocked activation re-evaluates entitlements at the boundary and
 * is denied — no partially-entitled enablement is committed.
 */
class EntitlementConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

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
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        if (\App\Core\Plans\CorePlan::query()->where('key', 'race-personal')->doesntExist()) {
            $plans->createPlan('race-personal', 'Race Personal', 'personal');
            $plans->createDraftVersion('race-personal', 1, 0);
            $plans->setModuleEntitlement('race-personal', 1, 'projects', true);
            $plans->publish('race-personal', 1);
        }
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $subscriptionIds = DB::table('core_subscriptions')->whereIn('personal_workspace_id', $this->workspaceIds)->pluck('id')->all();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('core_subscription_periods')->whereIn('subscription_id', $subscriptionIds)->delete();
            DB::table('core_subscriptions')->whereIn('id', $subscriptionIds)->delete();
            DB::table('workspace_modules')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
            $roleIds = DB::table('core_roles')->whereIn('workspace_id', $this->workspaceIds)->pluck('id')->all();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $this->workspaceIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_activation_rechecks_entitlement_after_competing_renewal_commits(): void
    {
        $admin = $this->platformAdmin();
        $owner = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $owner->id;
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->workspaceIds[] = (int) $workspace->id;

        $service = app(SubscriptionService::class);
        $subscription = $service->assignInitial($admin, $workspace, 'race-personal', 1,
            CarbonImmutable::parse('2026-01-01T00:00:00Z'), CarbonImmutable::parse('2027-01-01T00:00:00Z'), 'initial', 'corr-race-init');

        $this->travelTo(CarbonImmutable::parse('2026-06-01T00:00:00Z'));
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $this->assertTrue($preview->confirmable());

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner (renewal side) holds the workspace/owner row
            // and moves expiry into the past, uncommitted.
            $winner->table('workspaces')->where('id', $workspace->id)->lockForUpdate()->first();
            $winner->table('core_subscriptions')->where('id', $subscription->id)->update([
                'expires_at' => '2026-02-01 00:00:00', 'grace_ends_at' => '2026-02-01 00:00:00', 'status_version' => 2,
            ]);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                app(WorkspaceModuleService::class)->activate($owner, $workspace, 'projects', $preview->confirmationToken);
                $this->fail('Activation must block on the owner/workspace lock.');
            } catch (QueryException $exception) {
                $this->assertSame(1205, (int) ($exception->errorInfo[1] ?? 0));
            } finally {
                DB::statement('SET SESSION innodb_lock_wait_timeout = 50');
            }
        } finally {
            $winner->commit();
        }

        // Renewal committed: the activation re-evaluates and is
        // denied at the boundary; nothing was enabled.
        try {
            app(WorkspaceModuleService::class)->activate($owner, $workspace->fresh(), 'projects', $preview->confirmationToken);
            $this->fail('Activation must be denied after the competing expiry commits.');
        } catch (ModuleActivationException $exception) {
            $this->assertContains($exception->errorCode, ['module_activation_preview_stale', 'entitlement_missing']);
        }

        $this->assertSame(0, DB::table('workspace_modules')->where('workspace_id', $workspace->id)->count());
    }

    private function platformAdmin(): User
    {
        $admin = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $admin->id;
        PlatformRoleAssignment::create([
            'user_id' => $admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $admin;
    }
}
