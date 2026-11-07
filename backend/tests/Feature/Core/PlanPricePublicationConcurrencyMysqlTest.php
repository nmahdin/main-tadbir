<?php

namespace Tests\Feature\Core;

use App\Core\Billing\PlanPricePublisher;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S1 MySQL/MariaDB evidence (SPEC §3.2): two concurrent
 * publications of the same plan version serialize on the plan-version
 * FOR UPDATE row lock. The canonical published-price pointer + the
 * plan-version row lock together enforce one published price per
 * period; the defensive unique index alone does not.
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

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');

        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        Artisan::call('plans:provision-free');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $versionIds = DB::table('core_plan_versions')->whereIn('plan_id', $this->planIds)->pluck('id')->all();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->update([
                'published_monthly_price_id' => null,
                'published_quarterly_price_id' => null,
                'published_annual_price_id' => null,
            ]);
            DB::table('core_plan_prices')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_module_entitlements')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_limits')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->delete();
            DB::table('core_plans')->whereIn('id', $this->planIds)->delete();
        }
        parent::tearDown();
    }

    public function test_publish_prices_serializes_on_plan_version_row_lock(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = $provisioner->createPlan('conc', 'Conc', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('conc', 1);
        $provisioner->setPlanStatus('conc', CorePlan::STATUS_ACTIVE);
        $this->planIds[] = (int) $plan->id;

        $version = CorePlanVersion::where('plan_id', $plan->id)->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $publisher = app(PlanPricePublisher::class);
        $subscriptionId = (int) $version->id;

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Acquire the plan-version row lock via the secondary
            // connection but do NOT commit. The default-connection
            // publishPrices call begins its own transaction and must
            // block on the same plan-version FOR UPDATE.
            $winner->table('core_plan_versions')->where('id', $subscriptionId)->lockForUpdate()->first();

            $this->assertBlocked(function () use ($publisher, $version, $actor): void {
                $publisher->publishPrices($version, ['monthly' => 1_100_000], $actor);
            });
        } finally {
            $winner->rollBack();
        }

        // After lock release, publication succeeds and the pointer
        // points to a single published monthly price.
        $result = $publisher->publishPrices($version->fresh(), ['monthly' => 1_100_000], $actor);
        $v = $result['version']->fresh();
        $this->assertSame(1_100_000, (int) $v->publishedMonthlyPrice->amount_toman);

        // Idempotent replay keeps the original pointer.
        $again = $publisher->publishPrices($v->fresh(), ['monthly' => 9_999_999], $actor);
        $this->assertSame((int) $result['prices']['monthly']->id, (int) $again['prices']['monthly']->id);
    }

    private function assertBlocked(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');

        try {
            $attempt();
            $this->fail('Operation must block on the competing plan-version row lock.');
        } catch (QueryException $exception) {
            $this->assertSame(1205, (int) ($exception->errorInfo[1] ?? 0), $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = 50');
        }
    }
}
