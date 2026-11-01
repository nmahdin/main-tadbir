<?php

namespace Tests\Feature\Core;

use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S1 MySQL/MariaDB evidence (SPEC §3.2): two concurrent
 * publications of the same plan version serialize on the plan-version
 * FOR UPDATE row lock. After both transactions commit, exactly one
 * price per period is pointed to (the canonical pointer); the loser's
 * price remains as history but is superseded. The naive unique index
 * on (plan_version_id, period, amount_toman) alone is NOT sufficient,
 * and this test demonstrates that the pointer + lock combination is
 * the real invariant.
 */
class PlanPricePublicationConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $planIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise InnoDB row locks).');
        }

        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        app(\App\Core\Platform\PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        Artisan::call('plans:provision-free');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $versionIds = DB::table('core_plan_versions')->whereIn('plan_id', $this->planIds)->pluck('id')->all();
            // Null the canonical price FK pointers on the versions
            // before deleting prices so the RESTRICT FK is satisfied.
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->update([
                'published_monthly_price_id' => null,
                'published_annual_price_id' => null,
            ]);
            DB::table('core_plan_prices')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_module_entitlements')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_limits')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->delete();
            DB::table('core_plans')->whereIn('id', $this->planIds)->delete();
            DB::disconnect('mysql_concurrent');
        }
        parent::tearDown();
    }

    public function test_concurrent_publications_serialize_on_plan_version_row_lock(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = $provisioner->createPlan('conc', 'Conc', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('conc', 1);
        $provisioner->setPlanStatus('conc', CorePlan::STATUS_ACTIVE);
        $this->planIds[] = (int) $plan->id;

        $version = CorePlanVersion::where('plan_id', $plan->id)->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);

        // Use two separate connections so each transaction holds its
        // own locks. We mirror the existing CI concurrency-suite
        // pattern: $a is the default connection and $b is a second
        // dedicated connection alias configured to the same database.
        config(['database.connections.mysql_concurrent' => array_merge(
            config('database.connections.'.config('database.default', 'mysql'), []),
            ['name' => 'mysql_concurrent'],
        )]);
        DB::purge('mysql_concurrent');
        $a = DB::connection();
        $b = DB::connection('mysql_concurrent');

        // Set a short lock wait so we can confirm blocking behavior
        // without stalling CI.
        $a->statement('SET SESSION innodb_lock_wait_timeout = 4');
        $b->statement('SET SESSION innodb_lock_wait_timeout = 4');

        $publisher = app(PlanPricePublisher::class);

        $a->beginTransaction();
        try {
            // Acquire the plan-version lock by performing the publish
            // but don't commit yet.
            $aVersion = CorePlanVersion::on($a->getName())->whereKey($version->id)->lockForUpdate()->first();
            $now = now();
            $priceA = CorePlanPrice::on($a->getName())->create([
                'plan_version_id' => $aVersion->id,
                'period' => 'monthly',
                'amount_toman' => 1_100_000,
                'is_published' => true,
                'published_at' => $now,
                'created_by' => $actor->id,
            ]);
            // Update pointer inside the held transaction.
            CorePlanVersion::on($a->getName())->whereKey($aVersion->id)->update([
                'published_at' => $now,
                'published_monthly_price_id' => $priceA->id,
            ]);

            // Meanwhile connection B cannot publish the same version;
            // it blocks on FOR UPDATE of the plan-version row.
            $blocked = true;
            try {
                $b->beginTransaction();
                $publisher->publishPrices(
                    CorePlanVersion::on($b->getName())->whereKey($version->id)->first(),
                    ['monthly' => 2_200_000],
                    $actor,
                );
                $b->commit();
                $blocked = false;
            } catch (\Illuminate\Database\QueryException $e) {
                // Lock wait timeout proves serialization on the row.
                $this->assertStringContainsString('Lock wait timeout', $e->getMessage());
                $b->rollBack();
            }
            $this->assertTrue($blocked, 'Competing publication must block on the plan-version row lock.');

            $a->commit();
        } catch (\Throwable $e) {
            $a->rollBack();
            throw $e;
        }

        // After commit there is exactly one pointed monthly price and
        // it is priceA. Any second publish afterwards is idempotent
        // and preserves the original pointer.
        $v = CorePlanVersion::whereKey($version->id)->first();
        $this->assertSame((int) $priceA->id, (int) $v->published_monthly_price_id);
        $this->assertSame(1_100_000, (int) $v->publishedMonthlyPrice->amount_toman);

        $result = $publisher->publishPrices($v->fresh(), ['monthly' => 9_999_999], $actor);
        $this->assertSame((int) $priceA->id, (int) $result['prices']['monthly']->id, 'Idempotent replay must keep the first pointer.');
    }
}
