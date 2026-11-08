<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingOrderLine;
use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\CorePromoReservation;
use App\Core\Billing\CorePromotion;
use App\Core\Billing\CoreTaxRule;
use App\Core\Billing\OrderService;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\PromotionService;
use App\Core\Billing\QuoteService;
use App\Core\Billing\TaxRuleService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Http\Controllers\Api\V1\BillingOrderController;
use App\Http\Controllers\Api\V1\BillingQuoteController;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S4 order review + safe quote-to-order conversion.
 */
class BillingOrderTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        $this->actor = User::factory()->create(['status' => 'active']);
    }

    // ---- conversion across all three periods ----

    public function test_convert_monthly_quote_produces_order_with_frozen_totals(): void
    {
        $v = $this->publishedVersion('om', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $quote = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'ko-m')['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $quote, 'ko-c-m')['order'];

        $this->assertSame(CoreBillingOrder::STATUS_IN_REVIEW, $order->status);
        $this->assertSame(500_000, (int) $order->subtotal_toman);
        $this->assertSame(0, (int) $order->discount_toman);
        $this->assertSame(0, (int) $order->tax_toman);
        $this->assertSame(500_000, (int) $order->total_toman);
        $this->assertSame('monthly', $order->period);
        $this->assertSame((int) $quote->id, (int) $order->quote_id);
        $this->assertFalse($order->cancelled_at || $order->expired_at);
        $this->assertCount(1, $order->lines);
        $planLine = $order->lines->first(fn ($l) => $l->kind === CoreBillingOrderLine::KIND_PLAN);
        $this->assertNotNull($planLine);
        $this->assertSame(500_000, (int) $planLine->amount_toman);
    }

    public function test_convert_quarterly_and_annual_quotes_independent(): void
    {
        $v = $this->publishedVersion('omqa', CorePlan::AUDIENCE_PERSONAL, [
            'monthly' => 500_000,
            'quarterly' => 1_300_000,
            'annual' => 5_000_000,
        ]);
        $owner = $this->personalOwner($this->actor);
        $qq = $this->quotes()->create($this->actor, $owner, $v, 'quarterly', null, 'k-o-q')['quote'];
        $qa = $this->quotes()->create($this->actor, $owner, $v, 'annual', null, 'k-o-a')['quote'];
        $oq = $this->orders()->convert($this->actor, $owner, $qq, 'c-o-q')['order'];
        $oa = $this->orders()->convert($this->actor, $owner, $qa, 'c-o-a')['order'];

        $this->assertSame(1_300_000, (int) $oq->total_toman);
        $this->assertSame(5_000_000, (int) $oa->total_toman);
        $this->assertSame((int) $qq->id, (int) $oq->quote_id);
        $this->assertSame((int) $qa->id, (int) $oa->quote_id);
    }

    public function test_conversion_with_promo_and_tax_freezes_all_components(): void
    {
        $v = $this->publishedVersion('ofz', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 1_500_000]);
        $this->activateTax(900);
        $this->createPromo('OW10', 'percent', 1000, null);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'OW10', 'k-ofz')['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-ofz')['order'];

        $this->assertSame(1_500_000, (int) $order->subtotal_toman);
        $this->assertSame(150_000, (int) $order->discount_toman);
        $this->assertSame(121_500, (int) $order->tax_toman);
        $this->assertSame(1_471_500, (int) $order->total_toman);
        $kinds = $order->lines->pluck('kind')->all();
        $this->assertContains('plan', $kinds);
        $this->assertContains('discount', $kinds);
        $this->assertContains('tax', $kinds);
        $discountLine = $order->lines->first(fn ($l) => $l->kind === 'discount');
        $this->assertSame(-150_000, (int) $discountLine->amount_toman, 'Discount line is negative');
    }

    // ---- strict-boundary rejection ----

    public function test_conversion_rejected_at_exact_expiry(): void
    {
        $v = $this->publishedVersion('obnd', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $at = CarbonImmutable::now();
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-bnd', null, $at)['quote'];
        // Fake expires_at to a boundary so that now equals expires_at
        $q->forceFill(['expires_at' => $at->addMinutes(5)])->save();
        try {
            $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-bnd', $at->addMinutes(5));
            $this->fail('Expected quote_expired at exact boundary.');
        } catch (BillingDomainException $e) {
            $this->assertSame('quote_expired', $e->errorCode);
        }
        $q->refresh();
        $this->assertSame(CoreBillingQuote::STATUS_EXPIRED, $q->status, 'Exact-boundary attempt must expire the quote.');
        $this->assertSame(0, CoreBillingOrder::query()->count());
    }

    // ---- idempotent replay ----

    public function test_repeated_conversion_returns_same_order(): void
    {
        $v = $this->publishedVersion('oidm', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-idm')['quote'];
        $r1 = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-idm');
        $r2 = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-idm');
        $r3 = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-idm-diff-key');
        $this->assertFalse($r1['is_replay']);
        $this->assertTrue($r2['is_replay']);
        $this->assertTrue($r3['is_replay']);
        $this->assertSame((int) $r1['order']->id, (int) $r2['order']->id);
        $this->assertSame((int) $r1['order']->id, (int) $r3['order']->id);
        $this->assertSame(1, CoreBillingOrder::query()->count());
        $this->assertSame(1, CoreBillingOrderLine::query()->count());
    }

    // ---- at-most-one-order-per-quote via DB constraint ----

    public function test_at_most_one_order_per_quote_db_enforced(): void
    {
        $v = $this->publishedVersion('ouniq', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-uniq')['quote'];
        $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-uniq');
        $owner = $this->personalOwner($this->actor);
        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
        DB::table('core_billing_orders')->insert([
            'quote_id' => $q->id,
            'owner_key' => $owner->key(),
            'period' => 'monthly',
            'subtotal_toman' => 100_000,
            'discount_toman' => 0,
            'tax_toman' => 0,
            'total_toman' => 100_000,
            'status' => 'in_review',
            'review_expires_at' => now()->addDays(7),
            'idempotency_key' => 'dup',
            'created_by_user_id' => $this->actor->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    // ---- promo reservation handoff ----

    public function test_promo_reservation_transfers_to_order_on_conversion_without_redeeming(): void
    {
        $v = $this->publishedVersion('otr', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $promo = $this->createPromo('TR', 'percent', 5000 /*50%*/, null, maxRedemptions: 1);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'TR', 'k-tr')['quote'];
        $this->assertSame(1, CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_RESERVED)->count());
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-tr')['order'];
        $this->assertSame(0, CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_RESERVED)->count(), 'Reservation leaves quote scope.');
        $converted = CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_CONVERTED)->first();
        $this->assertNotNull($converted, 'Reservation transfers to converted state.');
        $this->assertSame((int) $order->id, (int) $converted->order_id);
        $promo->refresh();
        $this->assertSame(0, (int) $promo->redeemed_count, 'S4 never increments redeemed_count.');
    }

    // ---- promo release on cancel ----

    public function test_cancel_releases_promo_capacity_exactly_once(): void
    {
        $v = $this->publishedVersion('ocrel', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $promo = $this->createPromo('CR', 'percent', 5000, null, maxRedemptions: 1);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'CR', 'k-crel')['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-crel')['order'];
        $this->orders()->cancel($this->actor, $this->personalOwner($this->actor), (int) $order->id);
        $this->orders()->cancel($this->actor, $this->personalOwner($this->actor), (int) $order->id); // idempotent
        $this->assertSame(1, CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_RELEASED)->count());
        $this->assertSame(0, CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_CONVERTED)->count());
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_CANCELLED, $order->status);
        // Capacity must now be reusable — create a second quote using the same promo.
        $v2 = $this->publishedVersion('ocrel2', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 300_000]);
        $q2 = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v2, 'monthly', 'CR', 'k-crel2')['quote'];
        $this->assertSame(300_000, (int) $q2->subtotal_toman);
        $this->assertSame(150_000, (int) $q2->discount_toman);
    }

    // ---- promo release on review expiry ----

    public function test_review_expiry_releases_promo_capacity(): void
    {
        $v = $this->publishedVersion('oexp', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $promo = $this->createPromo('EX', 'fixed', null, 10_000, maxRedemptions: 1);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'EX', 'k-oexp')['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-oexp')['order'];
        $order->forceFill(['review_expires_at' => CarbonImmutable::now()->subDay()])->save();
        $expired = $this->orders()->expireReviewOrders();
        $this->assertSame(1, $expired);
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_REVIEW_EXPIRED, $order->status);
        $this->assertSame(1, CorePromoReservation::query()->where('promo_id', $promo->id)->where('state', CorePromoReservation::STATE_EXPIRED)->count());
        $this->assertSame(0, CorePromoReservation::query()->where('promo_id', $promo->id)->whereIn('state', [CorePromoReservation::STATE_RESERVED, CorePromoReservation::STATE_CONVERTED])->count());
    }

    // ---- immutable totals after catalog changes ----

    public function test_order_totals_immutable_after_catalog_tax_promo_change(): void
    {
        $v = $this->publishedVersion('oimm', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $this->activateTax(900); // 9%
        $this->createPromo('IM', 'percent', 1000 /*10%*/, null);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'IM', 'k-oimm')['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-oimm')['order'];
        $subtotalAtCreation = (int) $order->subtotal_toman;
        $discountAtCreation = (int) $order->discount_toman;
        $taxAtCreation = (int) $order->tax_toman;
        $totalAtCreation = (int) $order->total_toman;

        // Change catalog: supersede price, deactivate promo, change tax.
        $prov = app(PlanProvisioner::class);
        $publisher = app(PlanPricePublisher::class);
        $prov->createDraftVersion('oimm', 2);
        $v2 = CorePlanVersion::where('version', 2)->firstOrFail();
        $publisher->createDraftPrice($v2, 'monthly', 999_999, $this->actor);
        $publisher->publishPrices($v2, ['monthly' => 999_999], $this->actor);
        $prov->publish('oimm', 2);
        CorePromotion::query()->update(['is_active' => 0]);
        CoreTaxRule::query()->update(['rate_basis_points' => 2000]);

        $order->refresh();
        $this->assertSame($subtotalAtCreation, (int) $order->subtotal_toman);
        $this->assertSame($discountAtCreation, (int) $order->discount_toman);
        $this->assertSame($taxAtCreation, (int) $order->tax_toman);
        $this->assertSame($totalAtCreation, (int) $order->total_toman, 'Order totals are a frozen snapshot.');
    }

    // ---- supersession / expiry before conversion ----

    public function test_cannot_convert_superseded_quote(): void
    {
        $v = $this->publishedVersion('osup', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $q1 = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-sup1')['quote'];
        // Creating a second quote for same owner+version supersedes q1.
        $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-sup2');
        $q1->refresh();
        $this->assertSame(CoreBillingQuote::STATUS_SUPERSEDED, $q1->status);
        try {
            $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q1, 'c-sup');
            $this->fail('Expected quote_superseded');
        } catch (BillingDomainException $e) {
            $this->assertSame('quote_superseded', $e->errorCode);
        }
    }

    // ---- cross-tenant 404 at controller layer ----

    public function test_cross_tenant_order_access_returns_404_not_403(): void
    {
        $user1 = $this->actor;
        $user2 = User::factory()->create(['status' => 'active']);
        $v = $this->publishedVersion('oten', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $q = $this->quotes()->create($user1, $this->personalOwner($user1), $v, 'monthly', null, 'k-ten')['quote'];
        $order = $this->orders()->convert($user1, $this->personalOwner($user1), $q, 'c-ten')['order'];

        $token = $user2->createToken('apitoken')->plainTextToken;
        $resp = $this->withHeaders(['Authorization' => 'Bearer '.$token])
            ->getJson("/api/v1/billing/orders/{$order->id}");
        $resp->assertStatus(404);
    }

    // ---- unauthorized org member ----

    public function test_org_member_without_billing_manage_cannot_convert_or_view_orders(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $other = User::factory()->create(['status' => 'active']);
        $org = Organization::query()->create([
            'name' => 'Unauth Org',
            'slug' => 'unauth-'.bin2hex(random_bytes(3)),
            'created_by' => $owner->id,
        ]);
        $ws = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        OrganizationMembership::query()->create([
            'organization_id' => $org->id,
            'user_id' => $owner->id,
            'role_id' => null,
            'status' => MembershipStatus::Active,
        ]);
        OrganizationMembership::query()->create([
            'organization_id' => $org->id,
            'user_id' => $other->id,
            'role_id' => null,
            'status' => MembershipStatus::Active,
        ]);
        $this->grantOrgPermission($owner, $org, 'organization.billing.manage');
        // $other has plain membership but no billing.manage.

        $v = $this->publishedVersion('ounauth', CorePlan::AUDIENCE_ORGANIZATION, ['monthly' => 400_000]);
        $q = $this->quotes()->create($owner, new SubscriptionOwner('organization', $org, null), $v, 'monthly', null, 'k-unauth')['quote'];
        $order = $this->orders()->convert($owner, new SubscriptionOwner('organization', $org, null), $q, 'c-unauth')['order'];

        $token = $other->createToken('apitoken')->plainTextToken;
        $resp = $this->withHeaders(['Authorization' => 'Bearer '.$token])
            ->getJson("/api/v1/billing/orders/{$order->id}");
        $resp->assertStatus(404, 'Non-manager sees 404 not 403 to avoid leaking existence.');

        $resp2 = $this->withHeaders(['Authorization' => 'Bearer '.$token])
            ->postJson("/api/v1/billing/quotes/{$q->id}/convert", ['idempotency_key' => 'c-bad']);
        $resp2->assertStatus(404);
    }

    // ---- owner-delete restrict ----

    public function test_owner_delete_restricted_when_orders_exist(): void
    {
        $v = $this->publishedVersion('odro', CorePlan::AUDIENCE_ORGANIZATION, ['monthly' => 250_000]);
        $owner = User::factory()->create(['status' => 'active']);
        $org = Organization::query()->create([
            'name' => 'Delete Restrict Co',
            'slug' => 'dr-'.bin2hex(random_bytes(3)),
            'created_by' => $owner->id,
        ]);
        OrganizationMembership::query()->create([
            'organization_id' => $org->id,
            'user_id' => $owner->id,
            'role_id' => null,
            'status' => MembershipStatus::Active,
        ]);
        $this->grantOrgPermission($owner, $org, 'organization.billing.manage');
        $q = $this->quotes()->create($owner, new SubscriptionOwner('organization', $org, null), $v, 'monthly', null, 'k-dro')['quote'];
        $this->orders()->convert($owner, new SubscriptionOwner('organization', $org, null), $q, 'c-dro');

        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $threw = false;
            try {
                $org->delete();
            } catch (\Illuminate\Database\QueryException $e) {
                $threw = str_contains($e->getMessage(), 'CONSTRAINT') || str_contains($e->getMessage(), 'foreign key') || str_contains($e->getCode(), '23000') || str_contains($e->getCode(), 'HY000');
            }
            $this->assertTrue($threw, 'Organization delete must be RESTRICT while it owns an order.');
            $this->assertNotNull(CoreBillingOrder::find(1), 'Order must remain after a failed owner delete.');
        } else {
            $this->markTestSkipped('Owner-delete restrict is a MySQL/MariaDB FK property.');
        }
    }

    // ---- 7-day review TTL default ----

    public function test_default_review_ttl_is_seven_days(): void
    {
        config(['billing.provisional.order_review_ttl_days' => 7]);
        $v = $this->publishedVersion('ottl', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $at = CarbonImmutable::now();
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-ttl', null, $at)['quote'];
        $order = $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-ttl', $at)['order'];
        $expected = $at->addDays(7);
        $this->assertSame(0, $order->review_expires_at->getTimestamp() <=> $expected->getTimestamp(), 'Review expires exactly seven days after conversion.');
    }

    // ---- payment_initiated always false in S4 ----

    public function test_payment_initiated_always_false_in_s4_api_response(): void
    {
        $v = $this->publishedVersion('opay', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-pay')['quote'];
        $token = $this->actor->createToken('t')->plainTextToken;
        $resp = $this->withHeaders(['Authorization' => 'Bearer '.$token, 'Idempotency-Key' => 'c-pay'])
            ->postJson("/api/v1/billing/quotes/{$q->id}/convert");
        $resp->assertStatus(201);
        $data = $resp->json('data.order');
        $this->assertFalse($data['payment_initiated']);
    }

    // ---- quote→converted terminal state ----

    public function test_conversion_marks_quote_converted_terminal(): void
    {
        $v = $this->publishedVersion('oterm', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $q = $this->quotes()->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'k-term')['quote'];
        $this->orders()->convert($this->actor, $this->personalOwner($this->actor), $q, 'c-term');
        $q->refresh();
        $this->assertSame(CoreBillingQuote::STATUS_CONVERTED, $q->status);
        $this->assertNotNull($q->converted_at);
    }

    // ---- helpers ----

    private function orders(): OrderService
    {
        return app(OrderService::class);
    }

    private function quotes(): QuoteService
    {
        return app(QuoteService::class);
    }

    private function personalOwner(User $user): SubscriptionOwner
    {
        $ws = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);

        return new SubscriptionOwner('personal', null, $ws);
    }

    private function publishedVersion(string $planKey, string $audience, array $pricesByPeriod): CorePlanVersion
    {
        $p = app(PlanProvisioner::class);
        $p->createPlan($planKey, ucfirst($planKey), $audience);
        $p->createDraftVersion($planKey, 1);
        $p->setPlanStatus($planKey, CorePlan::STATUS_ACTIVE);
        $v = CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', $planKey))->firstOrFail();
        app(PlanPricePublisher::class)->publishPrices($v, $pricesByPeriod, $this->actor);

        return $v->fresh();
    }

    private function activateTax(int $bp): CoreTaxRule
    {
        return app(TaxRuleService::class)->createRule('VAT-'.bin2hex(random_bytes(2)), $bp, $this->actor, true);
    }

    private function createPromo(string $code, string $type, ?int $bp, ?int $fixed, ?int $maxRedemptions = null, ?int $perOwner = null): CorePromotion
    {
        return app(PromotionService::class)->create($code, 'promo', $type, $bp, $fixed, $this->actor, null, null, $maxRedemptions, $perOwner);
    }

    private function grantOrgPermission(User $user, Organization $org, string $permKey): void
    {
        $perm = ScopedPermission::where('key', $permKey)->firstOrFail();
        $role = ScopedRole::query()->create([
            'scope' => 'organization',
            'organization_id' => $org->id,
            'name' => 'org-billing-mgr',
            'key' => 'obm_'.bin2hex(random_bytes(3)),
            'is_protected' => false,
        ]);
        $role->permissions()->attach($perm->id);
        $m = OrganizationMembership::query()
            ->where('user_id', $user->id)
            ->where('organization_id', $org->id)
            ->first();
        if ($m === null) {
            OrganizationMembership::query()->create([
                'organization_id' => $org->id,
                'user_id' => $user->id,
                'role_id' => $role->id,
                'status' => MembershipStatus::Active,
            ]);
        } else {
            $m->forceFill(['role_id' => $role->id, 'status' => MembershipStatus::Active])->save();
        }
    }
}
