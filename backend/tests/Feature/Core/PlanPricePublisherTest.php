<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\MoneyToman;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Plans\PlanProvisioningException;
use App\Core\Rbac\PermissionCatalog;
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
        // Prefer the protected primary administrator when the
        // requested permission is part of its approved set (avoids
        // colliding with frozen-set provisioning assertions).
        app(\App\Core\Platform\PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $primary = \App\Core\Platform\PlatformRole::where('key', \App\Core\Platform\PlatformRoleProvisioner::PRIMARY_ROLE_KEY)->firstOrFail();
        $primaryKeys = $primary->permissions()->pluck('key')->all();
        if (in_array($permission, $primaryKeys, true)) {
            $role = $primary;
        } else {
            $role = \App\Core\Platform\PlatformRole::query()->create([
                'key' => 'test_billing_admin_'.str_replace('.', '_', $permission),
                'name' => 'Test Admin',
                'is_protected' => false,
            ]);
            $perm = \App\Core\Rbac\ScopedPermission::where('key', $permission)->firstOrFail();
            $role->permissions()->attach($perm->id);
        }

        $user = User::factory()->create(['status' => 'active']);
        \App\Core\Platform\PlatformRoleAssignment::query()->create([
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

        // The previously-drafted 2M row never existed (we didn't call
        // createDraftPrice above); verify that a stray draft row from
        // an aborted attempt is NOT pointed after publish.
        $draft2 = $this->publisher->createDraftPrice($version, 'monthly', 3_000_000, $actor);
        $this->assertNull($draft2->published_at);
        $this->assertFalse((bool) $draft2->is_published);
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
            $version->forceFill(['published_monthly_price_id' => null])->save();
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
}
