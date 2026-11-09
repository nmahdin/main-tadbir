<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S1 MySQL/MariaDB schema evidence: CHECK constraints on the
 * new core_plan_prices table, composite unique index, and
 * restrictive FK behavior (SQLite cannot enforce the CHECKs).
 */
class PlanPriceSchemaMysqlTest extends TestCase
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
        Artisan::call('plans:provision-free');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $versionIds = DB::table('core_plan_versions')->whereIn('plan_id', $this->planIds)->pluck('id')->all();
            DB::table('core_plan_prices')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_module_entitlements')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_limits')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->delete();
            DB::table('core_plans')->whereIn('id', $this->planIds)->delete();
        }

        parent::tearDown();
    }

    public function test_checks_unique_index_and_restrictive_fks(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = $provisioner->createPlan('scheck', 'SCheck', CorePlan::AUDIENCE_PERSONAL);
        $version = $provisioner->createDraftVersion('scheck', 1);
        $this->planIds[] = (int) $plan->id;

        // Duplicate (version_id, period, amount_toman) is rejected by
        // the defensive unique index.
        DB::table('core_plan_prices')->insert([
            'plan_version_id' => $version->id,
            'period' => 'monthly',
            'amount_toman' => 1_000_000,
            'is_published' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertQueryFails(fn () => DB::table('core_plan_prices')->insert([
            'plan_version_id' => $version->id,
            'period' => 'monthly',
            'amount_toman' => 1_000_000,
            'is_published' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        // Quarterly is accepted (M2-S2 quarterly support).
        DB::table('core_plan_prices')->insert([
            'plan_version_id' => $version->id,
            'period' => 'quarterly',
            'amount_toman' => 4_500_000,
            'is_published' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Bad period is rejected by CHECK.
        $this->assertQueryFails(fn () => DB::table('core_plan_prices')->insert([
            'plan_version_id' => $version->id,
            'period' => 'weekly',
            'amount_toman' => 100,
            'is_published' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        // Negative amount rejected.
        $this->assertQueryFails(fn () => DB::table('core_plan_prices')->insert([
            'plan_version_id' => $version->id,
            'period' => 'annual',
            'amount_toman' => -1,
            'is_published' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        // RESTRICT: a plan version with price history cannot be
        // deleted out from under its prices (FK restrictOnDelete).
        $this->assertQueryFails(fn () => DB::table('core_plan_versions')->where('id', $version->id)->delete());
    }

    private function assertQueryFails(callable $fn): void
    {
        $thrown = false;
        try {
            $fn();
        } catch (QueryException $e) {
            $thrown = true;
        }
        $this->assertTrue($thrown, 'Expected a database constraint violation.');
    }
}
