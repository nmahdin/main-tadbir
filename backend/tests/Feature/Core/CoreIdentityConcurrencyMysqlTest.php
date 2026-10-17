<?php

namespace Tests\Feature\Core;

use App\Core\Identity\AccountLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * MySQL-only concurrency evidence for the Stage C1-H1 final-admin
 * hardening.
 *
 * SQLite cannot prove any of this (it ignores SELECT ... FOR UPDATE
 * and serializes writers on the database file), so these tests are
 * SKIPPED off MySQL — SQLite behavior is covered by the sequential
 * invariant tests in CoreIdentityAuditTest, and nothing about MySQL
 * locking is claimed from SQLite runs.
 *
 * Method, following CoreRbacConcurrencyMysqlTest: fixtures are
 * committed (no RefreshDatabase, which would hide rows from the
 * second connection) and cleaned up explicitly. Each scenario puts
 * a real winner critical section in flight on a second connection —
 * the admin-role row lock (the lock every administrative mutation
 * path takes first) plus its uncommitted status transition — while
 * the competing transition runs the REAL AccountLifecycle service on
 * the default connection with a short lock-wait timeout. The loser
 * must block on InnoDB (proving genuine overlap/serialization), and
 * once the winner commits, the same request must be rejected by the
 * final-admin guard, leaving exactly one active administrator.
 */
class CoreIdentityConcurrencyMysqlTest extends TestCase
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
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('audit_logs')->whereIn('target_id', $this->userIds)->where('target_type', 'user')->delete();
            DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)
                ->whereIn('tokenable_id', $this->userIds)
                ->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
            $roleIds = DB::table('core_roles')->whereIn('workspace_id', $this->workspaceIds)->pluck('id');
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $this->workspaceIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_concurrent_suspend_requests_cannot_remove_both_active_admins(): void
    {
        [$adminA, $adminB] = [$this->admin(), $this->admin()];

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner's critical section in flight: admin-role lock
            // held, B's suspension uncommitted.
            $winner->table('roles')->where('key', 'admin')->lockForUpdate()->first();
            $winner->table('users')->where('id', $adminB->id)->update(['status' => 'suspended']);

            // The competing real lifecycle request (suspend A) must
            // block on the same lock instead of checking stale state.
            $this->assertLoserBlockedOnAdminLock(fn () => app(AccountLifecycle::class)->suspend($adminA, $adminA->fresh()));
        } finally {
            $winner->rollBack();
        }

        // Rolled back: both administrators are untouched.
        $this->assertSame('active', $adminA->fresh()->status);
        $this->assertSame('active', $adminB->fresh()->status);

        // Now the first suspension really commits...
        app(AccountLifecycle::class)->suspend($adminB, $adminA);
        $this->assertSame('suspended', $adminA->fresh()->status);

        // ...and the competing one is rejected: exactly one active
        // administrator (B) remains.
        $this->assertFinalAdminRejection(fn () => app(AccountLifecycle::class)->suspend($adminB, $adminB->fresh()));
        $this->assertSame('active', $adminB->fresh()->status);
        $this->assertSame(1, User::where('status', 'active')
            ->whereHas('role', fn ($query) => $query->where('key', 'admin'))
            ->count());
    }

    public function test_concurrent_deactivate_requests_roll_back_the_loser_completely(): void
    {
        [$adminA, $adminB] = [$this->admin(), $this->admin()];
        $tokenB = $adminB->createToken('b-device')->plainTextToken;
        $membershipB = $this->memberMembership($adminB);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('roles')->where('key', 'admin')->lockForUpdate()->first();
            $winner->table('users')->where('id', $adminB->id)->update(['status' => 'deactivated']);

            $this->assertLoserBlockedOnAdminLock(fn () => app(AccountLifecycle::class)->deactivate($adminB, $adminA->fresh()));
        } finally {
            $winner->rollBack();
        }

        // The real winning transition: A is suspended, leaving B as
        // the final active administrator.
        app(AccountLifecycle::class)->suspend($adminB, $adminA);
        $this->assertFinalAdminRejection(fn () => app(AccountLifecycle::class)->deactivate($adminB, $adminB->fresh()));

        // The rejected deactivation changed nothing about B.
        $this->assertSame('active', $adminB->fresh()->status);
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $adminB->id]);
        $this->assertTrue($membershipB->fresh()->isActive());
        $this->assertDatabaseMissing('audit_logs', [
            'action' => 'identity.account_deactivated',
            'target_id' => $adminB->id,
        ]);
        $this->assertNotNull($tokenB);
    }

    public function test_lifecycle_and_legacy_update_contend_for_the_same_admin_lock(): void
    {
        [$adminA, $adminB] = [$this->admin(), $this->admin()];

        // The legacy PATCH path's critical section in flight: it
        // takes the identical first lock (UserController::update).
        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('roles')->where('key', 'admin')->lockForUpdate()->first();
            $winner->table('users')->where('id', $adminA->id)->update(['status' => 'inactive']);

            $this->assertLoserBlockedOnAdminLock(fn () => app(AccountLifecycle::class)->suspend($adminB, $adminB->fresh()));
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // A is now inactive (legacy path won). B is the final active
        // administrator and the lifecycle refuses to remove them —
        // the invariant holds across endpoints.
        $this->assertFinalAdminRejection(fn () => app(AccountLifecycle::class)->deactivate($adminB, $adminB->fresh()));
        $this->assertSame('inactive', $adminA->fresh()->status);
        $this->assertSame('active', $adminB->fresh()->status);
    }

    private function assertLoserBlockedOnAdminLock(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('The competing transition must block on the admin-role lock held by the winner.');
        } catch (QueryException $exception) {
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = DEFAULT');
        }
    }

    private function assertFinalAdminRejection(callable $attempt): void
    {
        try {
            $attempt();
            $this->fail('The final active administrator transition must be rejected.');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }
    }

    private function admin(): User
    {
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        foreach (['users.delete', 'users.view', 'users.edit', 'users.status'] as $key) {
            $role->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            ));
        }

        $admin = User::factory()->create(['role_id' => $role->id, 'role_key' => 'admin', 'status' => 'active']);
        $this->userIds[] = (int) $admin->id;

        return $admin;
    }

    private function memberMembership(User $user): WorkspaceMembership
    {
        $owner = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $owner->id;
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->workspaceIds[] = (int) $workspace->id;

        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
            'status' => MembershipStatus::Active,
        ]);
        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        return $membership->refresh();
    }
}
