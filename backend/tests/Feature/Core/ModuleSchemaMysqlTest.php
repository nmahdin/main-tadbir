<?php

namespace Tests\Feature\Core;

use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only schema evidence for Stage C4-1: CHECK constraints,
 * composite uniqueness, and foreign keys on the module registry
 * tables. SQLite cannot enforce the CHECK set, so these run only
 * against real InnoDB (the CI MySQL job).
 */
class ModuleSchemaMysqlTest extends TestCase
{
    private ?int $userId = null;

    private ?int $workspaceId = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only schema test (SQLite cannot enforce these CHECK constraints).');
        }

        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql' && $this->workspaceId !== null) {
            DB::table('workspace_modules')->where('workspace_id', $this->workspaceId)->delete();
            DB::table('workspace_memberships')->where('workspace_id', $this->workspaceId)->delete();
            $roleIds = DB::table('core_roles')->where('workspace_id', $this->workspaceId)->pluck('id')->all();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->where('id', $this->workspaceId)->delete();
            DB::table('users')->where('id', $this->userId)->delete();
        }

        parent::tearDown();
    }

    public function test_check_constraints_reject_invalid_registry_values(): void
    {
        $this->assertQueryFails(fn () => DB::table('core_modules')->insert([
            'key' => 'bogus-module', 'name' => 'Bogus', 'availability' => 'sometimes',
            'created_at' => now(), 'updated_at' => now(),
        ]));

        $tasks = CoreModule::where('key', 'tasks')->firstOrFail();
        $this->assertQueryFails(fn () => DB::table('core_module_dependencies')->insert([
            'module_id' => $tasks->id, 'required_module_id' => $tasks->id,
        ]), 'self-dependency CHECK');
    }

    public function test_foreign_keys_and_composite_uniqueness_are_enforced(): void
    {
        $tasks = CoreModule::where('key', 'tasks')->firstOrFail();
        $forms = CoreModule::where('key', 'forms')->firstOrFail();
        $surveys = CoreModule::where('key', 'surveys')->firstOrFail();

        // FK: unknown module IDs are rejected.
        $this->assertQueryFails(fn () => DB::table('core_module_dependencies')->insert([
            'module_id' => 999999, 'required_module_id' => $forms->id,
        ]), 'dependency FK');

        // Composite uniqueness: the canonical surveys->forms edge
        // already exists after sync; inserting it again fails.
        $this->assertQueryFails(fn () => DB::table('core_module_dependencies')->insert([
            'module_id' => $surveys->id, 'required_module_id' => $forms->id,
        ]), 'duplicate edge');

        // Workspace/module pair uniqueness + status CHECK.
        $user = User::factory()->create(['status' => 'active']);
        $this->userId = (int) $user->id;
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);
        $this->workspaceId = (int) $workspace->id;

        WorkspaceModule::create([
            'workspace_id' => $workspace->id, 'module_id' => $tasks->id,
            'status' => WorkspaceModule::STATUS_DISABLED,
        ]);
        $this->assertQueryFails(fn () => WorkspaceModule::create([
            'workspace_id' => $workspace->id, 'module_id' => $tasks->id,
            'status' => WorkspaceModule::STATUS_DISABLED,
        ]), 'duplicate workspace/module pair');
        $this->assertQueryFails(fn () => DB::table('workspace_modules')->insert([
            'workspace_id' => $workspace->id, 'module_id' => $forms->id, 'status' => 'maybe',
            'created_at' => now(), 'updated_at' => now(),
        ]), 'workspace module status CHECK');
    }

    private function assertQueryFails(callable $attempt, string $because = 'constraint'): void
    {
        try {
            $attempt();
            $this->fail("Insert must fail ({$because}).");
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }
}
