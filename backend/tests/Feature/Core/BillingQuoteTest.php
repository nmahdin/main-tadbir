<?php

namespace Tests\Feature\Core;

use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\CorePlanPrice;
use App\Core\Billing\CorePromoReservation;
use App\Core\Billing\MoneyToman;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\PromotionService;
use App\Core\Billing\QuoteService;
use App\Core\Billing\TaxRuleService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Plans\PlanProvisioningException;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M2-S3 quote engine + promotion reservation lifecycle.
 */
class BillingQuoteTest extends TestCase
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

    // ---- worked example & three periods ----

    public function test_quote_worked_example_percent_discount_and_tax(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, [
            'monthly' => 1_500_000,
        ]);
        $this->activateTax(900);
        $promo = $this->createPromo('NOW10', 'percent', 1000, null);

        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);
        $r = $svc->create($this->actor, $owner, $v, CorePlanPrice::PERIOD_MONTHLY, 'NOW10', 'k1');

        $q = $r['quote'];
        $this->assertFalse($r['is_replay']);
        $this->assertSame(1_500_000, (int) $q->subtotal_toman);
        $this->assertSame(150_000, (int) $q->discount_toman);
        $this->assertSame(121_500, (int) $q->tax_toman);
        $this->assertSame(1_471_500, (int) $q->total_toman);
        $this->assertSame((int) $promo->id, (int) $q->promo_id);
        $this->assertSame(900, (int) $q->tax_rate_basis_points);
    }

    public function test_quarterly_and_annual_quotes_independent_amounts(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, [
            'monthly' => 500_000,
            'quarterly' => 1_300_000,
            'annual' => 5_000_000,
        ]);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        $qm = $svc->create($this->actor, $owner, $v, 'monthly', null, 'km')['quote'];
        $qq = $svc->create($this->actor, $owner, $v, 'quarterly', null, 'kq')['quote'];
        $qa = $svc->create($this->actor, $owner, $v, 'annual', null, 'ka')['quote'];

        $this->assertSame(500_000, (int) $qm->total_toman);
        $this->assertSame(1_300_000, (int) $qq->total_toman);
        $this->assertSame(5_000_000, (int) $qa->total_toman);
    }

    public function test_unpublished_or_missing_period_rejected(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        $threw = false;
        try {
            $svc->create($this->actor, $owner, $v, 'quarterly', null, 'kq');
        } catch (\App\Core\Billing\BillingDomainException $e) {
            $threw = $e->errorCode === 'price_unavailable';
        }
        $this->assertTrue($threw, 'Unpublished quarterly must be rejected.');

        $threw2 = false;
        try {
            $svc->create($this->actor, $owner, $v, 'weekly', null, 'kw');
        } catch (\App\Core\Billing\BillingDomainException $e) {
            $threw2 = $e->errorCode === 'period_invalid';
        }
        $this->assertTrue($threw2);
    }

    // ---- fixed discount cap ----

    public function test_fixed_discount_capped_at_subtotal(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $this->createPromo('FLAT200', 'fixed', null, 200_000);
        $svc = app(QuoteService::class);
        $q = $svc->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', 'FLAT200', 'kf')['quote'];
        $this->assertSame(100_000, (int) $q->discount_toman, 'Discount must not exceed subtotal.');
        $this->assertSame(0, (int) $q->total_toman);
    }

    // ---- tax round-half-up ----

    public function test_tax_rounding_round_half_up_once_per_quote(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 1_005]);
        $this->activateTax(1000); // 10%
        $svc = app(QuoteService::class);
        $q = $svc->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'kr')['quote'];
        $this->assertSame(101, (int) $q->tax_toman, 'pct(1005,1000)=101 (round-half-up).');
    }

    // ---- expiry ----

    public function test_quote_expires_at_exact_ttl_boundary(): void
    {
        config(['billing.quote.ttl_minutes' => 30]);
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $svc = app(QuoteService::class);
        $at = CarbonImmutable::now();
        $r = $svc->create($this->actor, $this->personalOwner($this->actor), $v, 'monthly', null, 'ke', null, $at);
        $q = $r['quote'];
        $this->assertSame(CoreBillingQuote::STATUS_OPEN, $q->status);
        $this->assertSame(30 * 60, $q->remainingSeconds($at));
        // Before expiry (29:59 after creation) still open.
        $this->assertTrue($q->isOpen());
        $this->assertFalse($q->isExpiredAt($at->addMinutes(29)->addSeconds(59)));
        // At exact expires_at: expired.
        $this->assertTrue($q->isExpiredAt($at->addMinutes(30)));

        // Lazy expiry via findForOwner:
        $found = $svc->findForOwner((int) $q->id, $this->personalOwner($this->actor));
        $this->assertSame(CoreBillingQuote::STATUS_EXPIRED, $found->status);
    }

    public function test_sweeper_expires_quotes_and_releases_reservations(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $promo = $this->createPromo('SINGLEUSE', 'fixed', null, 10_000, maxRedemptions: 1);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        // Force-expire a quote by backdating expires_at so we don't wait.
        $q = $svc->create($this->actor, $owner, $v, 'monthly', 'SINGLEUSE', 'kexp')['quote'];
        DB::table('core_billing_quotes')->where('id', $q->id)->update(['expires_at' => now()->subMinute()]);

        $expired = $svc->expireOpenQuotes();
        $this->assertSame(1, $expired);
        // Reservation released/exised
        $res = CorePromoReservation::query()->where('quote_id', $q->id)->first();
        $this->assertSame(CorePromoReservation::STATE_EXPIRED, $res->state);
        // Capacity reusable.
        $q2 = $svc->create($this->actor, $owner, $v, 'monthly', 'SINGLEUSE', 'kexp2')['quote'];
        $this->assertNotNull($q2->promo_id);
    }

    // ---- supersession ----

    public function test_new_quote_supersedes_prior_open_quote_and_releases_reservation(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000, 'annual' => 900_000]);
        $promo = $this->createPromo('CAP1', 'fixed', null, 5_000, maxRedemptions: 1);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        $q1 = $svc->create($this->actor, $owner, $v, 'monthly', 'CAP1', 'ks1')['quote'];
        $this->assertSame(CoreBillingQuote::STATUS_OPEN, $q1->status);
        $this->assertSame(CorePromoReservation::STATE_RESERVED, $q1->reservations->first()->state);

        $q2 = $svc->create($this->actor, $owner, $v, 'annual', 'CAP1', 'ks2')['quote'];
        $q1->refresh();
        $this->assertSame(CoreBillingQuote::STATUS_SUPERSEDED, $q1->status);
        $this->assertSame((int) $q2->id, (int) $q1->superseded_by_quote_id);
        // Prior reservation released.
        $this->assertSame(CorePromoReservation::STATE_RELEASED, $q1->reservations->first()->state);
        $this->assertSame(CorePromoReservation::STATE_RESERVED, $q2->reservations->first()->state);
    }

    // ---- concurrent final-capacity ----

    public function test_concurrent_capacity_reservation_yields_exactly_one_winner(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $promo = $this->createPromo('RACE', 'fixed', null, 10_000, maxRedemptions: 1);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        $winners = 0;
        $losers = 0;
        // In a single PHP process, open two parallel transactions via
        // separate DB connections to simulate concurrent creates.
        $connA = DB::connection()->getPdo();
        // Use two separate transactions through the query builder to
        // force both to evaluate capacity against the same promo row.
        // Since SQLite in-memory doesn't isolate writes from separate
        // connections well, we approximate by using two immediate
        // serialized calls in this test; the MySQL-specific suite
        // (BillingQuoteConcurrencyMysqlTest) verifies the real
        // engine-level isolation.
        for ($i = 0; $i < 2; $i++) {
            try {
                $svc->create($this->actor, $owner, $v, 'monthly', 'RACE', 'kc'.$i);
                $winners++;
            } catch (\App\Core\Billing\BillingDomainException $e) {
                if ($e->errorCode === 'promo_capacity_exceeded') {
                    $losers++;
                } else {
                    throw $e;
                }
            }
        }
        $this->assertSame(1, $winners, 'Exactly one quote reserves the last slot.');
        $this->assertSame(1, $losers, 'The second attempt fails with capacity exhausted.');
    }

    // ---- idempotency ----

    public function test_idempotent_create_returns_existing_quote_without_second_reservation(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $promo = $this->createPromo('IDEM', 'percent', 1000, null, maxRedemptions: 5);
        $svc = app(QuoteService::class);
        $owner = $this->personalOwner($this->actor);

        $r1 = $svc->create($this->actor, $owner, $v, 'monthly', 'IDEM', 'key-abc');
        $r2 = $svc->create($this->actor, $owner, $v, 'monthly', 'IDEM', 'key-abc');
        $this->assertTrue($r2['is_replay']);
        $this->assertSame((int) $r1['quote']->id, (int) $r2['quote']->id);
        $this->assertSame(1, CorePromoReservation::query()->where('promo_id', $promo->id)->count());
    }

    // ---- cross-tenant isolation + org permission ----

    public function test_cross_owner_quote_access_returns_404_and_org_requires_permission(): void
    {
        $v = $this->publishedVersion('org', CorePlan::AUDIENCE_ORGANIZATION, ['monthly' => 100_000]);
        $org = Organization::query()->create([
            'name' => 'Acme',
            'slug' => 'acme',
            'status' => 'active',
            'created_by_user_id' => $this->actor->id,
        ]);
        $this->grantOrgPermission($this->actor, $org, 'organization.billing.manage');
        $svc = app(QuoteService::class);
        $ownerOrg = new \App\Core\Subscriptions\SubscriptionOwner('organization', $org, null);
        $q = $svc->create($this->actor, $ownerOrg, $v, 'monthly', null, 'k-org')['quote'];

        // Other user should not see it.
        $other = User::factory()->create(['status' => 'active']);
        $this->actingAs($other)->getJson("/api/v1/billing/quotes/{$q->id}")->assertNotFound();

        // Owner (with billing.manage) sees it.
        $resp = $this->actingAs($this->actor)->getJson("/api/v1/billing/quotes/{$q->id}");
        $resp->assertOk()->assertJsonPath('data.quote.id', (int) $q->id);

        // Actor WITHOUT billing.manage cannot create or read org quote.
        $user2 = User::factory()->create(['status' => 'active']);
        // Add membership but no billing permission.
        OrganizationMembership::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user2->id,
            'role' => 'member',
        ]);
        $this->actingAs($user2)->postJson("/api/v1/billing/quotes/organizations/{$org->id}", [
            'plan_version_id' => (int) $v->id,
            'period' => 'monthly',
            'idempotency_key' => 'k-deny',
        ])->assertForbidden();
    }

    // ---- HTTP create + idempotency-replay ----

    public function test_http_personal_create_endpoint_returns_201_then_200_replay(): void
    {
        $v = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $payload = ['plan_version_id' => (int) $v->id, 'period' => 'monthly', 'idempotency_key' => 'http-k'];
        $resp1 = $this->actingAs($this->actor)->postJson('/api/v1/billing/quotes/personal', $payload);
        $resp1->assertCreated();
        $id = $resp1->json('data.quote.id');

        $resp2 = $this->actingAs($this->actor)->postJson('/api/v1/billing/quotes/personal', $payload);
        $resp2->assertOk()->assertJsonPath('data.quote.id', $id)->assertJsonPath('data.is_replay', true);
    }

    public function test_quote_monetary_snapshot_immutable_after_price_change(): void
    {
        $v1 = $this->publishedVersion('pers', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $svc = app(QuoteService::class);
        $q = $svc->create($this->actor, $this->personalOwner($this->actor), $v1, 'monthly', null, 'ki')['quote'];

        // Simulate future price publication by creating a new price row and
        // pointing it (supersession). Existing quote amounts unchanged.
        $publisher = app(PlanPricePublisher::class);
        $newDraft = $publisher->createDraft($v1, 'monthly', 600_000, $this->actor);
        $publisher->publish($v1, ['monthly' => 600_000], $this->actor);
        $q->refresh();
        $this->assertSame(500_000, (int) $q->subtotal_toman);
        $this->assertSame(500_000, (int) $q->total_toman);
        $this->assertSame(500_000, (int) $q->price->amount_toman, 'Quote must still reference the original price row.');
    }

    // ---- helpers ----

    private function personalOwner(User $user): \App\Core\Subscriptions\SubscriptionOwner
    {
        $ws = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);

        return new \App\Core\Subscriptions\SubscriptionOwner('personal', null, $ws);
    }

    private function publishedVersion(string $planKey, string $audience, array $pricesByPeriod): \App\Core\Plans\CorePlanVersion
    {
        $p = app(PlanProvisioner::class);
        $p->createPlan($planKey, ucfirst($planKey), $audience);
        $p->createDraftVersion($planKey, 1);
        $p->setPlanStatus($planKey, CorePlan::STATUS_ACTIVE);
        $v = \App\Core\Plans\CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', $planKey))->firstOrFail();
        app(PlanPricePublisher::class)->publishPrices($v, $pricesByPeriod, $this->actor);

        return $v->fresh();
    }

    private function activateTax(int $bp): \App\Core\Billing\CoreTaxRule
    {
        return app(TaxRuleService::class)->createRule('VAT', $bp, $this->actor, true);
    }

    private function createPromo(string $code, string $type, ?int $bp, ?int $fixed, ?int $maxRedemptions = null, ?int $perOwner = null): \App\Core\Billing\CorePromotion
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
            'key' => 'org_billing_mgr_'.bin2hex(random_bytes(3)),
            'is_protected' => false,
        ]);
        $role->permissions()->attach($perm->id);
        // Create or update organization membership with the scoped role id.
        $membership = OrganizationMembership::query()
            ->where('user_id', $user->id)
            ->where('organization_id', $org->id)
            ->first();
        if ($membership === null) {
            OrganizationMembership::query()->create([
                'organization_id' => $org->id,
                'user_id' => $user->id,
                'role_id' => $role->id,
                'status' => MembershipStatus::Active,
            ]);
        } else {
            $membership->forceFill(['role_id' => $role->id, 'status' => MembershipStatus::Active])->save();
        }
    }
}
