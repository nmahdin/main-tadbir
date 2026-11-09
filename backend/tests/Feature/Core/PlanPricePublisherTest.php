<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\MoneyToman;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Plans\PlanProvisioningException;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * C5-M2-S1: MoneyToman precision, published-price pointer invariant,
 * price/version immutability, and platform permission boundary.
 * MySQL/MariaDB concurrency evidence lives in
 * PlanPricePublicationConcurrencyMysqlTest.
 */
class PlanPricePublisherTest extends TestCase
{
    use RefreshDatabase;

    private PlanProvisioner $provisioner;

    private PlanPricePublisher $publisher;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        $this->provisioner = app(PlanProvisioner::class);
        $this->publisher = app(PlanPricePublisher::class);
    }

    private function platformActorWith(string $permission): User
    {
        // Always create a dedicated single-permission test role so
        // the actor holds EXACTLY the requested platform permission
        // — never the full primary-administrator set. Otherwise
        // negative-authorization tests (e.g. "subscriptions.manage
        // does NOT satisfy billing.manage") trivially pass when
        // the primary role already contains billing.manage.
        app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $role = PlatformRole::query()->create([
            'key' => 'test_role_'.str_replace('.', '_', $permission).'_'.bin2hex(random_bytes(3)),
            'name' => 'Test Admin ('.$permission.')',
            'is_protected' => false,
        ]);
        $perm = ScopedPermission::where('key', $permission)->firstOrFail();
        $role->permissions()->attach($perm->id);

        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::query()->create([
            'user_id' => $user->id,
            'platform_role_id' => $role->id,
            'granted_by_user_id' => $user->id,
        ]);

        return $user;
    }

    public function test_money_toman_example_numbers_match_spec(): void
    {
        $price = MoneyToman::of(1_500_000);
        $discount = $price->percentage(1000);
        $taxable = $price->subtract($discount);
        $tax = $taxable->percentage(900);
        $total = $taxable->add($tax);
        $this->assertSame(1_500_000, $price->toInt());
        $this->assertSame(150_000, $discount->toInt());
        $this->assertSame(1_350_000, $taxable->toInt());
        $this->assertSame(121_500, $tax->toInt());
        $this->assertSame(1_471_500, $total->toInt());
    }

    public function test_draft_price_created_and_published_price_is_pointer(): void
    {
        $this->provisioner->createPlan('biz', 'Biz', CorePlan::AUDIENCE_ORGANIZATION);
        $this->provisioner->createDraftVersion('biz', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'biz'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);

        $draft = $this->publisher->createDraftPrice($version, 'monthly', 2_000_000, $actor);
        $this->assertFalse($draft->isPublished());
        $this->assertNull($version->fresh()->published_monthly_price_id);

        $result = $this->publisher->publishPrices($version, ['monthly' => 2_000_000, 'annual' => 20_000_000], $actor);
        $v = $result['version']->fresh();
        $this->assertNotNull($v->published_at);
        $this->assertNotNull($v->published_monthly_price_id);
        $this->assertNotNull($v->published_annual_price_id);
        $this->assertSame(2_000_000, (int) $v->publishedMonthlyPrice->amount_toman);
        $this->assertSame(20_000_000, (int) $v->publishedAnnualPrice->amount_toman);
        $this->assertTrue($result['prices']['monthly']->isPublished());
    }

    public function test_publishing_supersedes_previously_pointed_rows_and_is_idempotent(): void
    {
        $this->provisioner->createPlan('solo', 'Solo', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('solo', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'solo'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);

        // Publish once.
        $r1 = $this->publisher->publishPrices($version, ['monthly' => 1_000_000], $actor);
        $firstId = (int) $r1['prices']['monthly']->id;

        // Manually point to a new price (simulates concurrent state
        // via the service itself — but we verify re-publishing a
        // published version returns the original idempotently).
        $r2 = $this->publisher->publishPrices($version, ['monthly' => 9_999_999], $actor);
        $this->assertSame($firstId, (int) $r2['prices']['monthly']->id, 'Republishing must return the originally-published pointer.');

        // Adding a new draft price to a published version is refused
        // (the version is immutable once published; price changes must
        // go through a new plan version).
        $threw = false;
        try {
            $this->publisher->createDraftPrice($version->fresh(), 'monthly', 3_000_000, $actor);
        } catch (BillingDomainException $e) {
            $threw = $e->errorCode === 'plan_version_published';
        }
        $this->assertTrue($threw, 'Draft prices must not be attachable to a published plan version.');
    }

    public function test_published_price_and_version_are_immutable_after_publication(): void
    {
        $this->provisioner->createPlan('imm', 'Imm', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('imm', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'imm'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $this->publisher->publishPrices($version, ['monthly' => 500_000], $actor);

        // Mutating amount/period on a published price is refused.
        $price = CorePlanPrice::find($version->fresh()->published_monthly_price_id);
        $threw = false;
        try {
            $price->forceFill(['amount_toman' => 999])->save();
        } catch (PlanProvisioningException|\Throwable $e) {
            $threw = true;
        }
        $this->assertTrue($threw, 'A published price must be immutable.');

        // Deleting a published price is refused.
        $threw2 = false;
        try {
            $price->delete();
        } catch (BillingDomainException $e) {
            $threw2 = $e->errorCode === 'price_immutable';
        }
        $this->assertTrue($threw2);

        // Mutating the canonical pointer column on a published version
        // is refused.
        $threw3 = false;
        try {
            $version->fresh()->forceFill(['published_monthly_price_id' => null])->save();
        } catch (PlanProvisioningException $e) {
            $threw3 = true;
        }
        $this->assertTrue($threw3, 'Published-version pointer must be immutable.');
    }

    public function test_invalid_period_and_amounts_fail_closed(): void
    {
        $this->provisioner->createPlan('v', 'V', CorePlan::AUDIENCE_ORGANIZATION);
        $this->provisioner->createDraftVersion('v', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'v'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);

        $this->expectException(BillingDomainException::class);
        $this->publisher->createDraftPrice($version, 'weekly', 1_000, $actor);
    }

    public function test_draft_price_on_published_version_refused(): void
    {
        $this->provisioner->createPlan('p', 'P', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('p', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'p'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $this->publisher->publishPrices($version, ['monthly' => 1_000_000], $actor);

        $this->expectException(BillingDomainException::class);
        $this->publisher->createDraftPrice($version->fresh(), 'monthly', 2_000_000, $actor);
    }

    public function test_platform_api_requires_billing_manage_not_subscriptions_manage(): void
    {
        $this->provisioner->createPlan('p', 'P', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('p', 1);
        $this->provisioner->setPlanStatus('p', CorePlan::STATUS_ACTIVE);

        // Actor with subscriptions.manage but NOT billing.manage must
        // be 403 (M2-D2=A: platform.billing.manage never substituted).
        $subActor = $this->platformActorWith('platform.subscriptions.manage');
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'p'))->firstOrFail();
        $this->actingAs($subActor)
            ->postJson("/api/v1/platform/billing/plan-versions/{$version->id}/publish-prices", [
                'monthly_amount_toman' => 1_000_000,
            ])
            ->assertForbidden();

        $billActor = $this->platformActorWith('platform.billing.manage');
        $response = $this->actingAs($billActor)
            ->postJson("/api/v1/platform/billing/plan-versions/{$version->id}/publish-prices", [
                'monthly_amount_toman' => 1_000_000,
                'annual_amount_toman' => 10_000_000,
            ]);
        $response->assertCreated();
        $data = $response->json('data');
        $this->assertSame(1_000_000, collect($data['prices'])->firstWhere('period', 'monthly')['amount_toman']);

        $show = $this->actingAs($billActor)
            ->getJson('/api/v1/platform/billing/plans/p/prices')
            ->assertOk();
        $this->assertCount(1, $show->json('data.versions'));
        $this->assertSame(1_000_000, $show->json('data.versions.0.prices.monthly.amount_toman'));
    }

    public function test_catalog_entry_returns_null_for_unpublished_or_inactive_plan(): void
    {
        $this->provisioner->createPlan('np', 'NP', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('np', 1);
        $plan = CorePlan::where('key', 'np')->firstOrFail();
        $this->assertNull($this->publisher->currentCatalogEntry($plan));

        $this->provisioner->setPlanStatus('np', CorePlan::STATUS_ACTIVE);
        $this->assertNull($this->publisher->currentCatalogEntry($plan->fresh()));
    }

    public function test_annual_null_means_unavailable_not_derived(): void
    {
        $this->provisioner->createPlan('mo', 'MO', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('mo', 1);
        $this->provisioner->setPlanStatus('mo', CorePlan::STATUS_ACTIVE);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'mo'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $this->publisher->publishPrices($version, ['monthly' => 500_000], $actor);
        $entry = $this->publisher->currentCatalogEntry($version->plan);
        $this->assertNotNull($entry['monthly']);
        $this->assertNull($entry['annual'], 'Missing annual price must stay null — never derived from monthly.');
    }

    public function test_quarterly_draft_created_and_published_independently_of_monthly_annual(): void
    {
        $this->provisioner->createPlan('q', 'Q', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('q', 1);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'q'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);

        $draft = $this->publisher->createDraftPrice($version, 'quarterly', 4_500_000, $actor);
        $this->assertFalse($draft->isPublished());
        $this->assertNull($version->fresh()->published_quarterly_price_id);

        $result = $this->publisher->publishPrices(
            $version,
            ['monthly' => 1_700_000, 'quarterly' => 4_500_000, 'annual' => 16_000_000],
            $actor,
        );
        $v = $result['version']->fresh();
        $this->assertNotNull($v->published_monthly_price_id);
        $this->assertNotNull($v->published_quarterly_price_id);
        $this->assertNotNull($v->published_annual_price_id);
        $this->assertSame(1_700_000, (int) $v->publishedMonthlyPrice->amount_toman);
        $this->assertSame(4_500_000, (int) $v->publishedQuarterlyPrice->amount_toman);
        $this->assertSame(16_000_000, (int) $v->publishedAnnualPrice->amount_toman);
        // Quarterly ≠ 3× monthly (independent, never derived).
        $this->assertNotSame(3 * 1_700_000, (int) $v->publishedQuarterlyPrice->amount_toman);
        $this->assertTrue($result['prices']['quarterly']->isPublished());
    }

    public function test_missing_quarterly_returns_null_and_unpublished_period_rejected(): void
    {
        $this->provisioner->createPlan('qm', 'QM', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('qm', 1);
        $this->provisioner->setPlanStatus('qm', CorePlan::STATUS_ACTIVE);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'qm'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $this->publisher->publishPrices($version, ['monthly' => 500_000, 'annual' => 5_000_000], $actor);

        $entry = $this->publisher->currentCatalogEntry($version->plan);
        $this->assertNotNull($entry['monthly']);
        $this->assertNull($entry['quarterly'], 'Missing quarterly price must stay null — never derived.');
        $this->assertNotNull($entry['annual']);

        // Invalid period still fails closed.
        $this->expectException(BillingDomainException::class);
        $this->publisher->createDraftPrice($version->fresh(), 'weekly', 1_000, $actor);
    }

    public function test_quarterly_period_backward_compat_monthly_annual_still_work(): void
    {
        // Publishing only monthly+annual (pre-quarterly client code)
        // continues to produce valid pointers and a null quarterly.
        $this->provisioner->createPlan('bac', 'BAC', CorePlan::AUDIENCE_ORGANIZATION);
        $this->provisioner->createDraftVersion('bac', 1);
        $this->provisioner->setPlanStatus('bac', CorePlan::STATUS_ACTIVE);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'bac'))->firstOrFail();
        $actor = User::factory()->create(['status' => 'active']);
        $result = $this->publisher->publishPrices($version, ['monthly' => 2_000_000, 'annual' => 20_000_000], $actor);
        $v = $result['version']->fresh();
        $this->assertNotNull($v->published_monthly_price_id);
        $this->assertNull($v->published_quarterly_price_id);
        $this->assertNotNull($v->published_annual_price_id);
    }

    public function test_api_accepts_quarterly_amount_and_surfaces_it_in_show(): void
    {
        $this->provisioner->createPlan('qa', 'QA', CorePlan::AUDIENCE_PERSONAL);
        $this->provisioner->createDraftVersion('qa', 1);
        $this->provisioner->setPlanStatus('qa', CorePlan::STATUS_ACTIVE);
        $version = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', 'qa'))->firstOrFail();

        $billActor = $this->platformActorWith('platform.billing.manage');
        $response = $this->actingAs($billActor)
            ->postJson("/api/v1/platform/billing/plan-versions/{$version->id}/publish-prices", [
                'monthly_amount_toman' => 1_500_000,
                'quarterly_amount_toman' => 4_000_000,
                'annual_amount_toman' => 14_000_000,
            ]);
        $response->assertCreated();
        $this->assertSame(4_000_000, collect($response->json('data.prices'))->firstWhere('period', 'quarterly')['amount_toman']);

        $show = $this->actingAs($billActor)->getJson('/api/v1/platform/billing/plans/qa/prices')->assertOk();
        $this->assertSame(4_000_000, $show->json('data.versions.0.prices.quarterly.amount_toman'));
    }
}
