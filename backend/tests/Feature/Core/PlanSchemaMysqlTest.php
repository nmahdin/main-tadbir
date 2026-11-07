<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only schema evidence for Stage C5-1: CHECK constraints,
 * composite primary keys, and restrictive foreign keys on the plan
 * catalog tables (SQLite cannot enforce the CHECK set).
 */
class PlanSchemaMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $planIds = [];

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
        if (DB::connection()->getDriverName() === 'mysql') {
            $versionIds = DB::table('core_plan_versions')->whereIn('plan_id', $this->planIds)->pluck('id')->all();
            DB::table('core_plan_limits')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_module_entitlements')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->delete();
            DB::table('core_plans')->whereIn('id', $this->planIds)->delete();
        }

        parent::tearDown();
    }

    public function test_checks_composite_keys_and_restrictive_foreign_keys(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = $provisioner->createPlan('schema-org', 'Schema Org', 'organization');
        $this->planIds[] = (int) $plan->id;
        $version = $provisioner->createDraftVersion('schema-org', 1, 0);
        $provisioner->setModuleEntitlement('schema-org', 1, 'projects', true);
        $provisioner->setLimit('schema-org', 1, 'workspaces', 2);

        // CHECK: audience / status / positive version.
        $this->assertQueryFails(fn () => DB::table('core_plans')->insert([
            'key' => 'bad-audience', 'name' => 'Bad', 'audience' => 'enterprise', 'status' => 'draft',
            'created_at' => now(), 'updated_at' => now(),
        ]));
        $this->assertQueryFails(fn () => DB::table('core_plan_versions')->insert([
            'plan_id' => $plan->id, 'version' => 0, 'grace_days' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]));

        // Composite keys reject duplicates on InnoDB too.
        $moduleId = DB::table('core_modules')->where('key', 'projects')->value('id');
        $this->assertQueryFails(fn () => DB::table('core_plan_module_entitlements')->insert([
            'plan_version_id' => $version->id, 'module_id' => $moduleId, 'is_allowed' => false,
        ]));

        // RESTRICT: a plan with versions, and a referenced module,
        // cannot be deleted out from under recorded history.
        $this->assertQueryFails(fn () => DB::table('core_plans')->where('id', $plan->id)->delete());
        $this->assertQueryFails(fn () => DB::table('core_modules')->where('id', $moduleId)->delete());

        // Committed postconditions: the provisioned content is intact.
        $this->assertSame(1, DB::table('core_plan_module_entitlements')->where('plan_version_id', $version->id)->count());
        $this->assertSame(0, (int) DB::table('core_plan_versions')->where('id', $version->id)->value('grace_days'));
    }

    private function assertQueryFails(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Query must be rejected by the schema.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }
}
