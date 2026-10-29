<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\FreePlanActivator;
use App\Core\Subscriptions\ResourceLimitGuard;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * G-1 evidence (MySQL/MariaDB only): quota assertion and the guarded
 * mutation serialize on the owner's subscription row. A competing
 * transaction holding that row lock blocks the guarded write
 * (innodb_lock_wait_timeout proof); after release, exactly one of
 * the competing writes consumes the final slot.
 */
class C5Ext01QuotaConcurrencyMysqlTest extends TestCase
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
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        Artisan::call('plans:provision-free');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $subscriptionIds = DB::table('core_subscriptions')->whereIn('personal_workspace_id', $this->workspaceIds)->orWhereIn('organization_id', $this->organizationIds)->pluck('id')->all();
            DB::table('projects')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('core_subscription_periods')->whereIn('subscription_id', $subscriptionIds)->delete();
            DB::table('core_subscriptions')->whereIn('id', $subscriptionIds)->delete();
            DB::table('free_activation_pending')->whereIn('personal_workspace_id', $this->workspaceIds)->orWhereIn('organization_id', $this->organizationIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('workspaces')->whereIn('id', $this->workspaceIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('activity_logs')->whereIn('user_id', $this->userIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_project_creation_serializes_on_subscription_lock_at_boundary(): void
    {
        [$user, $workspace] = $this->personalWithProjects(2); // one slot remains (cap 3)
        $guard = app(ResourceLimitGuard::class);
        $subscriptionId = (int) CoreSubscription::where('personal_workspace_id', $workspace->id)->value('id');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_subscriptions')->where('id', $subscriptionId)->lockForUpdate()->first();
            $this->assertBlocked(function () use ($guard, $workspace): void {
                DB::transaction(function () use ($guard, $workspace): void {
                    $guard->assertCanCreate($workspace, 'projects');
                    Project::create(['name' => 'رقیب', 'workspace_id' => $workspace->id, 'status' => 'active']);
                });
            });
        } finally {
            $winner->rollBack();
        }

        // After release exactly one creation consumes the final slot.
        DB::transaction(function () use ($guard, $workspace): void {
            $guard->assertCanCreate($workspace, 'projects');
            Project::create(['name' => 'سوم', 'workspace_id' => $workspace->id, 'status' => 'active']);
        });
        $this->assertSame(3, $this->activeProjects($workspace));

        try {
            DB::transaction(function () use ($guard, $workspace): void {
                $guard->assertCanCreate($workspace, 'projects');
                Project::create(['name' => 'چهارم', 'workspace_id' => $workspace->id, 'status' => 'active']);
            });
            $this->fail('creation beyond the cap must be denied');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(3, $this->activeProjects($workspace));
        $this->assertSame(3, Project::where('workspace_id', $workspace->id)->count()); // reads unaffected
    }

    public function test_reactivation_serializes_on_subscription_lock_at_boundary(): void
    {
        [$user, $workspace] = $this->personalWithProjects(2);
        $completedA = Project::create(['name' => 'تمام‌شده الف', 'workspace_id' => $workspace->id, 'status' => 'completed']);
        $completedB = Project::create(['name' => 'تمام‌شده ب', 'workspace_id' => $workspace->id, 'status' => 'completed']);
        $guard = app(ResourceLimitGuard::class);
        $subscriptionId = (int) CoreSubscription::where('personal_workspace_id', $workspace->id)->value('id');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_subscriptions')->where('id', $subscriptionId)->lockForUpdate()->first();
            $this->assertBlocked(function () use ($guard, $workspace, $completedA): void {
                DB::transaction(function () use ($guard, $workspace, $completedA): void {
                    $guard->assertCanCreate($workspace, 'projects');
                    $completedA->update(['status' => 'active']);
                });
            });
        } finally {
            $winner->rollBack();
        }

        DB::transaction(function () use ($guard, $workspace, $completedA): void {
            $guard->assertCanCreate($workspace, 'projects');
            $completedA->update(['status' => 'active']);
        });
        $this->assertSame(3, $this->activeProjects($workspace));

        try {
            DB::transaction(function () use ($guard, $workspace, $completedB): void {
                $guard->assertCanCreate($workspace, 'projects');
                $completedB->update(['status' => 'active']);
            });
            $this->fail('second reactivation beyond the cap must be denied');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(3, $this->activeProjects($workspace));
    }

    public function test_organization_member_guard_serializes_on_subscription_lock(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $owner->id;
        app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $organization = app(OrganizationProvisioner::class)->create($owner, 'سازمان رقابت', 'quota-race-org');
        $this->organizationIds[] = (int) $organization->id;
        $orgWorkspace = $organization->workspaces()->firstOrFail();
        $this->workspaceIds[] = (int) $orgWorkspace->id;

        // Owner occupies 1 of 3 Organization Free member slots.
        $guard = app(ResourceLimitGuard::class);
        $subscriptionId = (int) CoreSubscription::where('organization_id', $organization->id)->value('id');
        $this->assertGreaterThan(0, $subscriptionId);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_subscriptions')->where('id', $subscriptionId)->lockForUpdate()->first();
            $this->assertBlocked(function () use ($guard, $organization): void {
                DB::transaction(fn () => $guard->assertCanCreateForOrganization($organization, 'organization_members'));
            });
        } finally {
            $winner->rollBack();
        }

        // Two free slots remain: two assertions pass, the third is denied.
        DB::transaction(fn () => $guard->assertCanCreateForOrganization($organization, 'organization_members'));
        foreach (['race-m1', 'race-m2'] as $username) {
            $member = User::factory()->create(['status' => 'active', 'username' => $username]);
            $this->userIds[] = (int) $member->id;
            $organization->memberships()->create(['user_id' => $member->id, 'status' => MembershipStatus::Active->value]);
        }
        try {
            DB::transaction(fn () => $guard->assertCanCreateForOrganization($organization, 'organization_members'));
            $this->fail('member creation beyond the cap must be denied');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
    }

    /** @return array{0: User, 1: Workspace} */
    private function personalWithProjects(int $activeCount): array
    {
        $user = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $user->id;
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);
        $this->workspaceIds[] = (int) $workspace->id;
        app(FreePlanActivator::class)->activateForPersonalWorkspace($user, $workspace, 'quota-race-'.$user->id);

        foreach (range(1, $activeCount) as $i) {
            Project::create(['name' => "پروژه {$i}", 'workspace_id' => $workspace->id, 'status' => 'active']);
        }

        return [$user, $workspace];
    }

    private function activeProjects(Workspace $workspace): int
    {
        return Project::where('workspace_id', $workspace->id)
            ->whereNotIn('status', ['completed', 'cancelled', 'archived'])
            ->count();
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
