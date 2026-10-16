<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationLifecycleException;
use App\Core\Organizations\OrganizationLifecycleService;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only organization lifecycle concurrency evidence (C3-1).
 *
 * Scenarios use a second InnoDB connection, prove the competing
 * operation blocks on the organization row, roll the winner back,
 * then execute the real service and verify committed outcomes:
 * exactly one transition wins, stale versions are rejected, and
 * role mutations either serialize before suspension or observe
 * the suspended state and fail closed.
 */
class OrganizationLifecycleConcurrencyMysqlTest extends TestCase
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

    public function test_concurrent_lifecycle_attempts_commit_exactly_one_transition(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization] = $this->organizationContext('Concurrent Lifecycle Org');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('organizations')->where('id', $organization->id)->update([
                'status' => 'suspended',
                'suspended_at' => now(),
                'suspended_by_user_id' => $admin->id,
                'status_version' => 2,
            ]);

            $this->assertBlocked(fn () => $this->lifecycle()->suspend($admin, $organization, 'Losing concurrent suspension'));
        } finally {
            $winner->rollBack();
        }

        $suspended = $this->lifecycle()->suspend($admin, $organization->fresh(), 'Winning suspension', 1);
        $this->assertSame('suspended', $suspended->status);
        $this->assertSame(2, (int) $suspended->status_version);

        try {
            $this->lifecycle()->suspend($admin, $suspended, 'Duplicate suspension');
            $this->fail('A second suspension must be rejected.');
        } catch (OrganizationLifecycleException $exception) {
            $this->assertSame('invalid_transition', $exception->errorCode);
        }

        try {
            $this->lifecycle()->reactivate($admin, $suspended, 'Stale reactivation', 1);
            $this->fail('A stale expected version must be rejected.');
        } catch (OrganizationLifecycleException $exception) {
            $this->assertSame('stale_version', $exception->errorCode);
            $this->assertSame('suspended', $organization->fresh()->status);
            $this->assertSame(2, (int) $organization->fresh()->status_version);
        }
    }

    public function test_suspension_serializes_with_workspace_role_mutation(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('Suspension Role Race Org');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('organizations')->where('id', $organization->id)->update(['status' => 'suspended']);

            $this->assertBlocked(fn () => app(WorkspaceRoleService::class)->createCustomRole(
                $creator,
                $workspace,
                'Race Role',
                ['workspace.view'],
                'race_role',
            ));
        } finally {
            $winner->rollBack();
        }

        // The winner rolled back, so the organization is still
        // active and the real mutation succeeds exactly once.
        app(WorkspaceRoleService::class)->createCustomRole(
            $creator,
            $workspace->fresh(),
            'Race Role',
            ['workspace.view'],
            'race_role',
        );
        $this->assertSame(1, DB::table('core_roles')->where('workspace_id', $workspace->id)->where('key', 'race_role')->count());

        $this->lifecycle()->suspend($admin, $organization->fresh(), 'Freeze role administration');

        try {
            app(WorkspaceRoleService::class)->createCustomRole(
                $creator,
                $workspace->fresh(),
                'After Suspension',
                ['workspace.view'],
                'after_suspension',
            );
            $this->fail('Role creation after suspension must be denied.');
        } catch (RbacAuthorizationException) {
            $this->assertSame(0, DB::table('core_roles')->where('workspace_id', $workspace->id)->where('key', 'after_suspension')->count());
        }
    }

    public function test_suspension_serializes_with_organization_role_assignment(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, , $creator] = $this->organizationContext('Suspension Assignment Race Org');
        $member = $this->user();
        $membership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        app(OrganizationRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->organizationMember($organization),
        );
        $managerRole = app(RoleProvisioner::class)->organizationManager($organization);
        $memberRole = app(RoleProvisioner::class)->organizationMember($organization);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('organizations')->where('id', $organization->id)->update(['status' => 'suspended']);

            $this->assertBlocked(fn () => app(OrganizationRoleService::class)->assignRole($creator, $membership->fresh(), $managerRole));
        } finally {
            $winner->rollBack();
        }

        app(OrganizationRoleService::class)->assignRole($creator, $membership->fresh(), $managerRole);
        $this->assertSame($managerRole->id, (int) $membership->fresh()->role_id);

        $this->lifecycle()->suspend($admin, $organization->fresh(), 'Freeze assignments');
        try {
            app(OrganizationRoleService::class)->assignRole($creator, $membership->fresh(), $memberRole);
            $this->fail('Role assignment after suspension must be denied.');
        } catch (RbacAuthorizationException) {
            $this->assertSame($managerRole->id, (int) $membership->fresh()->role_id);
        }
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
