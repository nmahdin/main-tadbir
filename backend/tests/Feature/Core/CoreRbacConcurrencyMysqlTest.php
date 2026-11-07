<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\FinalManagerGuard;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only concurrency evidence for the Stage 03B hardening fix.
 *
 * These tests need two independent database connections, which the
 * SQLite test profile cannot provide meaningfully (SQLite ignores
 * SELECT ... FOR UPDATE; its writers serialize on the database file).
 * They are therefore SKIPPED on SQLite — SQLite behavior is covered by
 * the sequential invariant tests in CoreRbacTest, and nothing about
 * MySQL locking is claimed from SQLite runs.
 *
 * In CI they run in the "Backend migration gate on MySQL" job against
 * the MySQL 8.0 service after the migration gate (no RefreshDatabase:
 * RefreshDatabase would hide committed rows from the second
 * connection). Fixtures are committed and cleaned up explicitly.
 */
class CoreRbacConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $organizationIds = [];

    /** @var list<int> */
    private array $userIds = [];

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
        if (DB::connection()->getDriverName() === 'mysql' && $this->organizationIds !== []) {
            $workspaceIds = DB::table('workspaces')->whereIn('organization_id', $this->organizationIds)->pluck('id');
            $roleIds = DB::table('core_roles')
                ->whereIn('organization_id', $this->organizationIds)
                ->orWhereIn('workspace_id', $workspaceIds)
                ->pluck('id');

            DB::table('workspace_memberships')->whereIn('workspace_id', $workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $workspaceIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_scope_row_lock_blocks_a_concurrent_removal_transaction_until_release(): void
    {
        [$workspace, $creator] = $this->organizationWorkspaceContext();
        $secondManagerMembership = $this->addSecondManager($workspace);

        $connectionA = DB::connection();
        $connectionB = DB::connection('mysql_concurrent');

        $connectionA->beginTransaction();
        try {
            // Transaction A takes the workspace scope lock and demotes
            // one manager inside it (uncommitted).
            app(FinalManagerGuard::class)->lockWorkspaceScope($workspace->id);
            app(WorkspaceRoleService::class)->assignRole(
                $creator,
                $secondManagerMembership,
                app(RoleProvisioner::class)->workspaceMember($workspace),
            );

            // Transaction B, attempting the same scope lock for a
            // removal of the other manager, must block and fail with a
            // lock-wait timeout instead of passing its final-manager
            // check against stale state.
            $connectionB->beginTransaction();
            try {
                $connectionB->statement('SET SESSION innodb_lock_wait_timeout = 2');
                $connectionB->table('workspaces')->where('id', $workspace->id)->lockForUpdate()->first();
                $this->fail('The concurrent scope lock attempt must not succeed while transaction A holds it.');
            } catch (QueryException $e) {
                $this->assertStringContainsStringIgnoringCase('lock wait timeout', $e->getMessage());
            } finally {
                $connectionB->rollBack();
            }
        } finally {
            $connectionA->rollBack();
        }

        // A rolled back: both managers are still active managers, and
        // the invariant was never violated at any committed point.
        $this->assertSame(
            2,
            WorkspaceMembership::where('workspace_id', $workspace->id)
                ->where('status', 'active')
                ->whereNotNull('role_id')
                ->count(),
        );
    }

    public function test_after_one_manager_removal_commits_the_final_manager_removal_is_rejected_on_mysql(): void
    {
        [$workspace, $creator] = $this->organizationWorkspaceContext();
        $secondManagerMembership = $this->addSecondManager($workspace);

        $secondManagerMembership->end();

        $creatorMembership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $creator->id)
            ->firstOrFail();

        $this->expectException(RbacValidationException::class);
        $creatorMembership->end();
    }

    /**
     * @return array{0: Workspace, 1: User}
     */
    private function organizationWorkspaceContext(): array
    {
        $creator = User::factory()->create();
        $this->userIds[] = (int) $creator->id;

        /** @var Organization $organization */
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Concurrency Org '.uniqid());
        $this->organizationIds[] = (int) $organization->id;

        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$workspace, $creator];
    }

    private function addSecondManager(Workspace $workspace): WorkspaceMembership
    {
        $manager = User::factory()->create();
        $this->userIds[] = (int) $manager->id;

        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $manager->id,
            'status' => 'active',
        ]);

        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceManager($workspace),
        );

        return $membership->refresh();
    }
}
