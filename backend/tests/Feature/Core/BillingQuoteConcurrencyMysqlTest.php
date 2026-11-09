<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\CorePromoReservation;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\PromotionService;
use App\Core\Billing\QuoteService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S3 MySQL/MariaDB evidence: concurrent quote creation against a
 * max_redemptions=1 promo serializes on the promo FOR UPDATE row lock
 * and leaves exactly one reserved quote (M2-D4=A).
 */
class BillingQuoteConcurrencyMysqlTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<int> */
    private array $cleanupPlanIds = [];

    /** @var list<int> */
    private array $cleanupUserIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise InnoDB row locks).');
        }

        config(['database.connections.mysql_concurrent' => array_merge(
            config('database.connections.mysql'),
            ['options' => array_merge(
                config('database.connections.mysql.options', []),
                [\PDO::ATTR_TIMEOUT => 5],
            )],
        )]);
        DB::purge('mysql_concurrent');

        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        Artisan::call('plans:provision-free');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            $versionIds = DB::table('core_plan_versions')->whereIn('plan_id', $this->cleanupPlanIds)->pluck('id')->all();
            DB::table('core_billing_promo_reservations')->whereIn('quote_id', function ($q) use ($versionIds): void {
                $q->select('id')->from('core_billing_quotes')->whereIn('plan_version_id', $versionIds);
            })->delete();
            DB::table('core_billing_quotes')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_prices')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_module_entitlements')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_limits')->whereIn('plan_version_id', $versionIds)->delete();
            DB::table('core_plan_versions')->whereIn('id', $versionIds)->delete();
            DB::table('core_plans')->whereIn('id', $this->cleanupPlanIds)->delete();
            $promoIds = DB::table('core_promotions')->pluck('id')->all();
            DB::table('core_billing_promo_reservations')->whereIn('promo_id', $promoIds)->delete();
            DB::table('core_promotions')->whereIn('id', $promoIds)->delete();
            foreach ($this->cleanupUserIds as $uid) {
                DB::table('workspaces')->where('owner_user_id', $uid)->delete();
                DB::table('users')->where('id', $uid)->delete();
            }
        }
        parent::tearDown();
    }

    public function test_concurrent_quote_creation_yields_exactly_one_reservation_for_capacity_one_promo(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = $provisioner->createPlan('conc_quote', 'CQuote', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('conc_quote', 1);
        $provisioner->setPlanStatus('conc_quote', CorePlan::STATUS_ACTIVE);
        $this->cleanupPlanIds[] = (int) $plan->id;

        $version = CorePlanVersion::where('plan_id', $plan->id)->firstOrFail();
        $publisher = app(PlanPricePublisher::class);
        $publisher->publishPrices($version, ['monthly' => 100_000], $this->user('cq.actor'));
        $version = $version->fresh();

        $promoSvc = app(PromotionService::class);
        $actor = $this->user('cq.owner');
        $owner = new SubscriptionOwner(
            'personal',
            null,
            app(PersonalWorkspaceProvisioner::class)->ensureDefault($actor),
        );

        $promo = $promoSvc->create('CQ1', 'concurrency 1', 'fixed', null, 5_000, $actor, null, null, 1, 1);

        // First connection opens a transaction and locks the promo
        // row FOR UPDATE (simulating one in-flight quote creation).
        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_promotions')->where('id', $promo->id)->lockForUpdate()->first();

            $this->assertCapacityWait(function () use ($version, $actor, $owner): void {
                app(QuoteService::class)->create(
                    $actor, $owner, $version, CorePlanPrice::PERIOD_MONTHLY, 'CQ1', 'k-cq-blocked',
                );
            });
        } finally {
            $winner->rollBack();
        }

        // After lock release: first legitimate create wins, second
        // create fails with promo_capacity_exceeded.
        $svc = app(QuoteService::class);
        $r1 = $svc->create($actor, $owner, $version->fresh(), CorePlanPrice::PERIOD_MONTHLY, 'CQ1', 'k-cq-1');
        $this->assertSame(CoreBillingQuote::STATUS_OPEN, $r1['quote']->status);

        $threw = false;
        try {
            $svc->create($actor, $owner, $version->fresh(), CorePlanPrice::PERIOD_MONTHLY, 'CQ1', 'k-cq-2');
        } catch (BillingDomainException $e) {
            $threw = $e->errorCode === 'promo_capacity_exceeded';
        }
        $this->assertTrue($threw, 'Second concurrent quote must fail with promo_capacity_exceeded.');
        $this->assertSame(1, CorePromoReservation::query()->where('promo_id', $promo->id)
            ->where('state', CorePromoReservation::STATE_RESERVED)->count());
    }

    /**
     * @param  callable(): void  $attempt
     */
    private function assertCapacityWait(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('Operation must block on the promo row lock (proving FOR UPDATE serialization).');
        } catch (QueryException $exception) {
            $this->assertSame(1205, (int) ($exception->errorInfo[1] ?? 0), $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = 50');
        }
    }

    private function user(string $username): User
    {
        $u = User::factory()->create(['username' => $username, 'status' => 'active']);
        $this->cleanupUserIds[] = (int) $u->id;

        return $u;
    }
}
