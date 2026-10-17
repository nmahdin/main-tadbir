<?php

namespace Tests\Feature\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModuleService;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only competing-write evidence for Stage C4-2.
 *
 * Module activation takes the workspace row lock before any
 * activation row is written, so two competing activations of the
 * same workspace serialize: the loser cannot interleave a partial
 * prerequisite set or duplicate the unique (workspace, module) row.
 * Equally, an organization suspension committed while an activation
 * waits on the organization lock is observed after the wait and
 * denies the activation at the mutation boundary. Committed
 * postconditions are asserted — lock waits alone are not evidence.
 */
class ModuleActivationConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $workspaceIds = [];

    /** @var list<int> */
    private array $organizationIds = [];

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

        $this->app->instance(ModuleEntitlementGate::class, new class implements ModuleEntitlementGate
        {
            public function isEntitled(Workspace $workspace, string $moduleKey): bool
            {
                return $moduleKey === 'projects';
            }
        });
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('workspace_modules')->whereIn('workspace_id', $this->workspaceIds)->delete();
            DB::table('organization_module_policies')->whereIn('organization_id', $this->organizationIds)->delete();
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

    public function test_competing_activations_serialize_without_partial_or_duplicate_state(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $owner->id;
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->workspaceIds[] = (int) $workspace->id;

        $service = app(WorkspaceModuleService::class);
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner holds the workspace row lock mid-activation.
            $winner->table('workspaces')->where('id', $workspace->id)->lockForUpdate()->first();

            $this->assertBlocked(fn () => $service->activate($owner, $workspace, 'projects', $preview->confirmationToken));
        } finally {
            $winner->rollBack();
        }

        // Lock released: the same confirmed activation completes.
        $this->assertSame(['projects'], $service->activate($owner, $workspace, 'projects', $preview->confirmationToken));

        // Committed postconditions: exactly one enabled row, one audit entry.
        $this->assertSame(1, DB::table('workspace_modules')
            ->where('workspace_id', $workspace->id)
            ->where('status', 'enabled')
            ->count());
        $this->assertSame(1, DB::table('audit_logs')
            ->where('action', 'workspace.module_enabled')
            ->where('actor_user_id', $owner->id)
            ->count());
    }

    public function test_suspension_committed_mid_activation_denies_at_the_boundary(): void
    {
        $creator = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $creator->id;
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Race Org '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->workspaceIds[] = (int) $workspace->id;

        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();
            $winner->table('organizations')->where('id', $organization->id)->update([
                'status' => 'suspended', 'suspended_at' => now(), 'status_version' => 2,
            ]);

            $this->assertBlocked(fn () => app(WorkspaceModuleService::class)
                ->activate($creator, $workspace, 'projects', $preview->confirmationToken));
        } finally {
            $winner->commit();
        }

        // Suspension committed: the activation is denied and no
        // activation row exists.
        try {
            app(WorkspaceModuleService::class)->activate($creator, $workspace->fresh(), 'projects', $preview->confirmationToken);
            $this->fail('Activation in a suspended organization must be denied.');
        } catch (AuthorizationDeniedException) {
            $this->assertSame(0, DB::table('workspace_modules')->where('workspace_id', $workspace->id)->count());
        }
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
