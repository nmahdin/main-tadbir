<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationLifecycleService;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only in-flight write evidence for Stage C3-3.
 *
 * A workspace role mutation (a transactional Core write) takes
 * the workspace scope lock and then the organization row lock
 * before re-reading permissions. When suspension commits while
 * the mutation is blocked on the organization lock, the mutation
 * observes the suspended state after acquiring the lock and is
 * denied — it cannot slip a write in behind the suspension.
 * Already-resolved non-transactional contexts (plain reads) are
 * the documented residual limitation and are not claimed here.
 */
class OrganizationJobSafetyConcurrencyMysqlTest extends TestCase
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
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('audit_logs')
                ->where(fn ($query) => $query->whereIn('target_id', $this->organizationIds)->where('target_type', 'organization'))
                ->orWhereIn('actor_user_id', $this->userIds)
                ->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();

            $roleIds = DB::table('core_roles')
                ->whereIn('workspace_id', $this->workspaceIds)
                ->orWhereIn('organization_id', $this->organizationIds)
                ->pluck('id')->all();
            DB::table('workspace_memberships')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $this->workspaceIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_suspension_committed_mid_write_denies_the_write_after_lock_wait(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('In Flight Org');

        $suspension = DB::connection('mysql_concurrent');
        $suspension->beginTransaction();
        try {
            // Suspension in flight: row locked, state changed,
            // not yet committed.
            $suspension->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $suspension->table('organizations')->where('id', $organization->id)->update([
                'status' => 'suspended', 'suspended_at' => now(), 'status_version' => 2,
            ]);

            $this->assertBlocked(fn () => app(WorkspaceRoleService::class)->createCustomRole(
                $creator,
                $workspace,
                'In Flight Role',
                ['workspace.view'],
                'in_flight_role',
            ));
        } finally {
            // Suspension wins and COMMITS this time.
            $suspension->commit();
        }

        // The blocked mutation now acquires the lock, observes the
        // committed suspension, and is denied at the boundary.
        try {
            app(WorkspaceRoleService::class)->createCustomRole(
                $creator,
                $workspace->fresh(),
                'In Flight Role',
                ['workspace.view'],
                'in_flight_role',
            );
            $this->fail('A write whose eligibility is rechecked after suspension commits must be denied.');
        } catch (RbacAuthorizationException) {
            $this->assertSame(0, DB::table('core_roles')->where('workspace_id', $workspace->id)->where('key', 'in_flight_role')->count());
            $this->assertSame('suspended', $organization->fresh()->status);
        }

        // After reactivation the same write passes normally.
        $this->lifecycle()->reactivate($admin, $organization->fresh(), 'Resume');
        app(WorkspaceRoleService::class)->createCustomRole(
            $creator,
            $workspace->fresh(),
            'In Flight Role',
            ['workspace.view'],
            'in_flight_role',
        );
        $this->assertSame(1, DB::table('core_roles')->where('workspace_id', $workspace->id)->where('key', 'in_flight_role')->count());
    }

    public function test_lifecycle_transition_waits_for_an_in_flight_role_write_then_applies(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('Writer First Org');

        $writer = DB::connection('mysql_concurrent');
        $writer->beginTransaction();
        try {
            // Writer holds the organization lock inside its
            // mutation transaction (uncommitted role insert).
            $writer->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $writer->table('core_roles')->insert([
                'scope' => 'workspace',
                'workspace_id' => $workspace->id,
                'key' => 'writer_first_role',
                'name' => 'Writer First',
                'is_protected' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertBlocked(fn () => $this->lifecycle()->suspend($admin, $organization, 'Suspend after write'));
        } finally {
            $writer->commit();
        }

        // With the write committed, suspension applies cleanly on
        // top of it (the write is preserved, not rolled back).
        $suspended = $this->lifecycle()->suspend($admin, $organization->fresh(), 'Suspend after write');
        $this->assertSame('suspended', $suspended->status);
        $this->assertSame(1, DB::table('core_roles')->where('workspace_id', $workspace->id)->where('key', 'writer_first_role')->count());
    }

    private function assertBlocked(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('The competing operation must block on the organization row lock.');
        } catch (QueryException $exception) {
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = DEFAULT');
        }
    }

    /**
     * @return array{0: Organization, 1: Workspace, 2: User}
     */
    private function organizationContext(string $name): array
    {
        $creator = $this->user();
        $organization = app(OrganizationProvisioner::class)->create($creator, $name.' '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->organizationIds[] = (int) $organization->id;
        $this->workspaceIds[] = (int) $workspace->id;

        return [$organization, $workspace, $creator];
    }

    private function primaryAdministrator(): User
    {
        $user = $this->user();
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $user;
    }

    private function user(): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $user->id;

        return $user;
    }

    private function lifecycle(): OrganizationLifecycleService
    {
        return app(OrganizationLifecycleService::class);
    }
}
