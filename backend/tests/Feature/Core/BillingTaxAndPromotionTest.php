<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CatalogService;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\CorePromotion;
use App\Core\Billing\CoreTaxRule;
use App\Core\Billing\MoneyToman;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\PromotionService;
use App\Core\Billing\TaxRuleService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * C5-M2-S2 tax rules, promotions and read-only catalog.
 */
class BillingTaxAndPromotionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
    }

    // Tax ----------------------------------------------------------------

    public function test_tax_rule_create_and_active_returns_rule(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(TaxRuleService::class);
        $rule = $svc->createRule('VAT 9%', 900, $actor, true);
        $this->assertTrue($rule->is_active);
        $this->assertSame(900, (int) $rule->rate_basis_points);

        $active = $svc->activeRuleAt();
        $this->assertNotNull($active);
        $this->assertSame($rule->id, $active->id);
    }

    public function test_at_most_one_active_tax_rule_transactionally(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(TaxRuleService::class);
        $first = $svc->createRule('VAT 8%', 800, $actor, true);
        $second = $svc->createRule('VAT 9%', 900, $actor, true);

        $this->assertSame(1, CoreTaxRule::query()->where('is_active', true)->count());
        $active = $svc->activeRuleAt();
        $this->assertSame($second->id, $active->id);
        $this->assertFalse($first->fresh()->is_active);
    }

    public function test_tax_calculation_round_half_up_exclusive(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(TaxRuleService::class);
        $svc->createRule('VAT 9%', 900, $actor, true);
        // taxable 1,350,000 @ 9% = 121,500
        $result = $svc->calculateTax(1_350_000);
        $this->assertSame(121_500, $result['amount_toman']);
        $this->assertSame(900, $result['rate_basis_points']);

        // Edge: zero taxable yields zero tax.
        $this->assertSame(0, $svc->calculateTax(0)['amount_toman']);
    }

    public function test_deactivating_tax_rule_returns_zero_tax(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(TaxRuleService::class);
        $rule = $svc->createRule('VAT 9%', 900, $actor, true);
        $svc->deactivate($rule, $actor);
        $this->assertNull($svc->activeRuleAt());
        $this->assertSame(0, $svc->calculateTax(1_000_000)['amount_toman']);
    }

    public function test_invalid_rate_or_window_fail_closed(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(TaxRuleService::class);
        $threw = false;
        try {
            $svc->createRule('bad', 10001, $actor);
        } catch (\Throwable $e) {
            $threw = true;
        }
        $this->assertTrue($threw, 'Rates above 10000 bp must be rejected.');
    }

    // Promotions ---------------------------------------------------------

    public function test_percent_promotion_discount_round_half_up(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $promo = $svc->create('NOW10', 'Nowruz 10%', CorePromotion::TYPE_PERCENT, 1000, null, $actor);
        $result = $svc->evaluate('NOW10', 1_500_000);
        $this->assertSame(150_000, $result['discount_toman']);
        $this->assertTrue($promo->is($result['promotion']));
    }

    public function test_fixed_promotion_capped_at_subtotal(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $svc->create('FLAT200', 'Flat 200k', CorePromotion::TYPE_FIXED, null, 200_000, $actor);
        $this->assertSame(50_000, $svc->evaluate('FLAT200', 50_000)['discount_toman']);
        $this->assertSame(200_000, $svc->evaluate('FLAT200', 1_000_000)['discount_toman']);
    }

    public function test_inactive_or_expired_code_fails_closed(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $promo = $svc->create('EXPIRED', 'Old', CorePromotion::TYPE_PERCENT, 1000, null, $actor,
            startsAt: CarbonImmutable::now()->subDays(10), endsAt: CarbonImmutable::now()->subDays(1));
        $threw = false;
        try {
            $svc->evaluate('EXPIRED', 100_000);
        } catch (BillingDomainException $e) {
            $threw = $e->errorCode === 'promo_inactive';
        }
        $this->assertTrue($threw, 'Expired promo must be rejected.');

        $svc->deactivate($promo, $actor);
        $threw2 = false;
        try {
            $svc->evaluate('EXPIRED', 100_000);
        } catch (BillingDomainException $e) {
            $threw2 = true;
        }
        $this->assertTrue($threw2);
    }

    public function test_promo_capacity_enforced(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $svc->create('LIMITED', 'Limited', CorePromotion::TYPE_PERCENT, 1000, null, $actor, maxRedemptions: 2);
        // First two uses with one open reservation pass, third fails.
        $svc->evaluate('LIMITED', 100_000, 0);
        $svc->evaluate('LIMITED', 100_000, 1);
        $threw = false;
        try {
            $svc->evaluate('LIMITED', 100_000, 2);
        } catch (BillingDomainException $e) {
            $threw = $e->errorCode === 'promo_capacity_exceeded';
        }
        $this->assertTrue($threw);
    }

    public function test_no_promo_stacking_and_code_normalization(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $svc->create('  now10 ', 'Nowruz 10%', CorePromotion::TYPE_PERCENT, 1000, null, $actor);
        // Lookup is case/whitespace insensitive.
        $this->assertNotNull($svc->findByCode('NOW10'));
        // Duplicate code fails.
        $threw = false;
        try {
            $svc->create('NOW10', 'dup', CorePromotion::TYPE_PERCENT, 1000, null, $actor);
        } catch (BillingDomainException $e) {
            $threw = $e->errorCode === 'promo_code_exists';
        }
        $this->assertTrue($threw);
    }

    public function test_percent_and_fixed_mutually_exclusive_on_create(): void
    {
        $actor = User::factory()->create(['status' => 'active']);
        $svc = app(PromotionService::class);
        $this->expectException(BillingDomainException::class);
        $svc->create('BAD', 'bad', CorePromotion::TYPE_PERCENT, 1000, 50_000, $actor);
    }

    // Catalog -----------------------------------------------------------

    public function test_catalog_exposes_only_active_plans_with_a_published_price(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $publisher = app(PlanPricePublisher::class);
        $actor = User::factory()->create(['status' => 'active']);

        $provisioner->createPlan('pers', 'Pers', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('pers', 1);
        $provisioner->setPlanStatus('pers', CorePlan::STATUS_ACTIVE);
        $v = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'pers'))->firstOrFail();
        $publisher->publishPrices($v, ['monthly' => 500_000, 'quarterly' => 1_300_000, 'annual' => 5_000_000], $actor);

        // Inactive (draft) plan hidden — createPlan creates plans in draft status.
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $provisioner->createDraftVersion('team', 1);

        // Active plan with no published prices hidden.
        $provisioner->createPlan('noprice', 'NoPrice', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('noprice', 1);
        $provisioner->setPlanStatus('noprice', CorePlan::STATUS_ACTIVE);

        $catalog = app(CatalogService::class)->publicCatalog();
        $this->assertCount(1, $catalog);
        $entry = $catalog->first();
        $this->assertSame('pers', $entry['plan']->key);
        $this->assertNotNull($entry['monthly']);
        $this->assertNotNull($entry['quarterly']);
        $this->assertNotNull($entry['annual']);
        $this->assertSame(1_300_000, (int) $entry['quarterly']->amount_toman);
    }

    public function test_catalog_returns_null_missing_period_never_derived(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $publisher = app(PlanPricePublisher::class);
        $actor = User::factory()->create(['status' => 'active']);
        $provisioner->createPlan('monly', 'MOnly', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('monly', 1);
        $provisioner->setPlanStatus('monly', CorePlan::STATUS_ACTIVE);
        $v = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'monly'))->firstOrFail();
        $publisher->publishPrices($v, ['monthly' => 500_000], $actor);

        $entry = app(CatalogService::class)->publicCatalog()->first();
        $this->assertNotNull($entry['monthly']);
        $this->assertNull($entry['quarterly']);
        $this->assertNull($entry['annual']);
    }

    // HTTP/authorization ------------------------------------------------

    public function test_platform_tax_and_promo_endpoints_require_billing_manage(): void
    {
        $subActor = $this->platformActorWith('platform.subscriptions.manage');
        $this->actingAs($subActor)->getJson('/api/v1/platform/billing/tax-rules')->assertForbidden();
        $this->actingAs($subActor)->getJson('/api/v1/platform/billing/promotions')->assertForbidden();

        $billActor = $this->platformActorWith('platform.billing.manage');
        $this->actingAs($billActor)->getJson('/api/v1/platform/billing/tax-rules')->assertOk();
        $this->actingAs($billActor)->getJson('/api/v1/platform/billing/promotions')->assertOk();
    }

    public function test_platform_tax_create_and_activate_endpoints(): void
    {
        $actor = $this->platformActorWith('platform.billing.manage');
        $this->actingAs($actor)
            ->postJson('/api/v1/platform/billing/tax-rules', [
                'label' => 'VAT 9%',
                'rate_basis_points' => 900,
                'activate' => true,
            ])
            ->assertCreated();
        $resp = $this->actingAs($actor)->getJson('/api/v1/platform/billing/tax-rules/active')->assertOk();
        $this->assertSame(900, $resp->json('data.rule.rate_basis_points'));
    }

    public function test_platform_promo_create_endpoint(): void
    {
        $actor = $this->platformActorWith('platform.billing.manage');
        $this->actingAs($actor)
            ->postJson('/api/v1/platform/billing/promotions', [
                'code' => ' spring26 ',
                'label' => 'Spring 26',
                'discount_type' => 'percent',
                'discount_value_bp' => 1000,
                'max_redemptions' => 100,
            ])
            ->assertCreated()
            ->assertJsonPath('data.promotion.code', 'SPRING26');
    }

    public function test_public_catalog_available_to_any_authenticated_user(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $publisher = app(PlanPricePublisher::class);
        $actor = User::factory()->create(['status' => 'active']);
        $provisioner->createPlan('c', 'C', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createDraftVersion('c', 1);
        $provisioner->setPlanStatus('c', CorePlan::STATUS_ACTIVE);
        $v = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'c'))->firstOrFail();
        $publisher->publishPrices($v, ['monthly' => 100_000], $actor);

        $user = User::factory()->create(['status' => 'active']);
        $resp = $this->actingAs($user)->getJson('/api/v1/billing/catalog')->assertOk();
        $this->assertCount(1, $resp->json('data.plans'));
        $this->assertSame(100_000, $resp->json('data.plans.0.prices.monthly.amount_toman'));
        $this->assertNull($resp->json('data.plans.0.prices.quarterly'));
        $this->assertNull($resp->json('data.plans.0.prices.annual'));
    }

    // Helpers (mirrors PlanPricePublisherTest helper) -------------------

    private function platformActorWith(string $permission): User
    {
        app(\App\Core\Platform\PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $role = \App\Core\Platform\PlatformRole::query()->create([
            'key' => 'test_role_'.str_replace('.', '_', $permission).'_'.bin2hex(random_bytes(3)),
            'name' => 'Test Admin ('.$permission.')',
            'is_protected' => false,
        ]);
        $perm = \App\Core\Rbac\ScopedPermission::where('key', $permission)->firstOrFail();
        $role->permissions()->attach($perm->id);
        $user = User::factory()->create(['status' => 'active']);
        \App\Core\Platform\PlatformRoleAssignment::query()->create([
            'user_id' => $user->id,
            'platform_role_id' => $role->id,
            'granted_by_user_id' => $user->id,
        ]);

        return $user;
    }
}
