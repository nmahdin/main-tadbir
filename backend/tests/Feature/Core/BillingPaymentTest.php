<?php

namespace Tests\Feature\Core;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\CorePromoReservation;
use App\Core\Billing\CorePromotion;
use App\Core\Billing\CoreTaxRule;
use App\Core\Billing\OrderService;
use App\Core\Billing\PaymentService;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\PromotionService;
use App\Core\Billing\QuoteService;
use App\Core\Billing\TaxRuleService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionFulfillment;
use App\Core\Subscriptions\SubscriptionLifecycle;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Core\Subscriptions\SubscriptionState;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * C5-M3 payment + C5-M4 fulfillment end-to-end tests.
 */
class BillingPaymentTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    private ?User $orgAdmin = null;

    private ?Organization $org = null;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        $this->actor = User::factory()->create(['status' => 'active']);
        // Force sandbox gateway for tests via config.
        config(['billing.gateway' => 'sandbox']);
        // Provision free plans for owner resolution.
        $provisioner = app(PlanProvisioner::class);
        $this->createPlanIfMissing((string) config('billing.free.personal_plan_key'), CorePlan::AUDIENCE_PERSONAL, (int) config('billing.free.personal_plan_version'));
        $this->createPlanIfMissing((string) config('billing.free.organization_plan_key'), CorePlan::AUDIENCE_ORGANIZATION, (int) config('billing.free.organization_plan_version'));
    }

    // ---- M3: successful payment + activation ----

    public function test_successful_payment_activates_subscription(): void
    {
        $v = $this->publishVersion('pbasic', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-p1')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-p1')['order'];
        $this->assertSame(CoreBillingOrder::STATUS_IN_REVIEW, $order->status);

        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-p1');
        $this->assertFalse($init['is_replay']);
        $this->assertNotNull($init['redirect_url']);
        $payment = $init['payment']->fresh();
        $this->assertSame(CoreBillingPayment::STATUS_PENDING, $payment->status);
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_PAYABLE_PENDING, $order->status);

        // Simulate provider callback return with sandbox=settle.
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $query);
        $query['sandbox'] = 'settle';
        $result = $svc->verifyAndFinalize($this->actor, $payment, $query);
        $this->assertSame('paid', $result['outcome']);
        $payment->refresh();
        $this->assertSame(CoreBillingPayment::STATUS_PAID, $payment->status);
        $this->assertSame(500_000, (int) $payment->verified_amount_toman);
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_PAID, $order->status);

        // Promo reservation redeemed (in this test there is no promo).
        // Dispatch outbox.
        $fulfillment = app(SubscriptionFulfillment::class);
        $svc->dispatchOutbox(function (CoreBillingFulfillmentOutbox $evt) use ($fulfillment): void {
            $fulfillment->fulfillPaid($evt);
        });
        $payment->refresh();
        $this->assertSame(CoreBillingPayment::STATUS_FULFILLED, $payment->status);

        // Subscription created and active.
        $sub = CoreSubscription::query()->where('personal_workspace_id', app(PersonalWorkspaceProvisioner::class)->ensureDefault($this->actor)->id)->first();
        $this->assertNotNull($sub);
        $this->assertSame((int) $v->id, (int) $sub->plan_version_id);
        $state = app(SubscriptionLifecycle::class)->evaluate($sub);
        $this->assertSame(SubscriptionState::Active, $state);

        // Period row present with paid_by_payment_id.
        $period = $sub->periods()->first();
        $this->assertNotNull($period);
        $this->assertSame(SubscriptionPeriod::OPERATION_PAID_ACTIVATION, $period->operation);
        $this->assertSame((int) $payment->id, (int) $period->paid_by_payment_id);
    }

    public function test_failed_payment_marks_payment_failed_not_paid_order(): void
    {
        $v = $this->publishVersion('pfail', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 200_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-f1')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-f1')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-f1');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $query);
        $query['sandbox'] = 'fail';
        $result = $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $query);
        $this->assertSame('failed', $result['outcome']);
        $init['payment']->refresh();
        $this->assertSame(CoreBillingPayment::STATUS_FAILED, $init['payment']->status);
        // Order remains payable_pending — can be retried with another payment attempt.
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_PAYABLE_PENDING, $order->status);
    }

    public function test_pending_payment_stays_retryable(): void
    {
        $v = $this->publishVersion('pend', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-pend')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-pend')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-pend');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $query);
        $query['sandbox'] = 'pending';
        $result = $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $query);
        $this->assertSame('pending', $result['outcome']);
        $init['payment']->refresh();
        $this->assertSame(CoreBillingPayment::STATUS_PENDING, $init['payment']->status);
        $this->assertSame('pending', $init['payment']->reconciliation_state);
    }

    public function test_duplicate_callback_is_idempotent(): void
    {
        $v = $this->publishVersion('pidm', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-pidm')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-pidm')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-pidm');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $query);
        $query['sandbox'] = 'settle';
        $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $query);
        $result2 = $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $query);
        $this->assertTrue($result2['is_replay']);
        $this->assertSame(1, CoreBillingPayment::query()->where('order_id', $order->id)->count());
        // Dispatch outbox twice → only one subscription / period.
        $svc = $this->payments();
        $f = app(SubscriptionFulfillment::class);
        $svc->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $svc->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $this->assertSame(1, CoreSubscription::query()->count());
        $sub = CoreSubscription::query()->first();
        $this->assertSame(1, $sub->periods()->count());
    }

    public function test_amount_mismatch_fails_payment(): void
    {
        $v = $this->publishVersion('pmm', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-pmm')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-pmm')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-pmm');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $query);
        $query['sandbox'] = 'badamount';
        $query['verified_amount_toman'] = 50_000;
        $result = $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $query);
        $this->assertSame('failed', $result['outcome']);
        $this->assertSame('amount_mismatch', $init['payment']->fresh()->failure_code);
    }

    public function test_cross_tenant_access_returns_404(): void
    {
        $other = User::factory()->create(['status' => 'active']);
        $v = $this->publishVersion('px', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-x')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-x')['order'];
        $token = $other->createToken('t')->plainTextToken;
        $resp = $this->withHeaders(['Authorization' => 'Bearer '.$token, 'Idempotency-Key' => 'i-x'])
            ->postJson("/api/v1/billing/orders/{$order->id}/pay");
        $resp->assertStatus(404);
    }

    public function test_zero_payable_settles_without_psp(): void
    {
        $this->activateTax(0);
        $promo = $this->createPromo('FREE100', 'percent', 10000, null); // 100%
        $v = $this->publishVersion('pzero', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', 'FREE100', 'k-z')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-z')['order'];
        $this->assertSame(0, (int) $order->total_toman);

        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-z');
        $this->assertNull($init['redirect_url']);
        $this->assertSame(CoreBillingPayment::STATUS_ZERO_SETTLED, $init['payment']->status);
        $order->refresh();
        $this->assertSame(CoreBillingOrder::STATUS_PAID, $order->status);

        $f = app(SubscriptionFulfillment::class);
        $this->payments()->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $sub = CoreSubscription::query()->where('personal_workspace_id', app(PersonalWorkspaceProvisioner::class)->ensureDefault($this->actor)->id)->first();
        $this->assertNotNull($sub);
        $this->assertSame(SubscriptionState::Active, app(SubscriptionLifecycle::class)->evaluate($sub));
    }

    public function test_expired_order_cannot_be_paid(): void
    {
        $v = $this->publishVersion('pex', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $at = CarbonImmutable::now()->subDays(10);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-ex', null, $at)['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-ex', null, $at)['order'];
        // Force order review expiry.
        $order->forceFill(['review_expires_at' => $at->addDays(7), 'status' => CoreBillingOrder::STATUS_REVIEW_EXPIRED])->save();

        $this->expectException(BillingDomainException::class);
        $this->payments()->initiate($this->actor, $owner, $order->fresh(), 'i-ex');
    }

    public function test_payment_idempotent_replay_returns_same_payment(): void
    {
        $v = $this->publishVersion('prep', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-rep')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-rep')['order'];
        $r1 = $this->payments()->initiate($this->actor, $owner, $order, 'i-rep');
        $r2 = $this->payments()->initiate($this->actor, $owner, $order, 'i-rep');
        $this->assertTrue($r2['is_replay']);
        $this->assertSame((int) $r1['payment']->id, (int) $r2['payment']->id);
    }

    // ---- M4: renewal stacking ----

    public function test_manual_renewal_stacks_next_term(): void
    {
        $v = $this->publishVersion('pren', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        // First purchase
        $quote1 = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-r1')['quote'];
        $order1 = $this->orders()->convert($this->actor, $owner, $quote1, 'c-r1')['order'];
        $init1 = $this->payments()->initiate($this->actor, $owner, $order1, 'i-r1');
        parse_str(parse_url($init1['redirect_url'], PHP_URL_QUERY), $q1);
        $q1['sandbox'] = 'settle';
        $this->payments()->verifyAndFinalize($this->actor, $init1['payment'], $q1);
        $f = app(SubscriptionFulfillment::class);
        $this->payments()->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $sub = CoreSubscription::query()->where('personal_workspace_id', app(PersonalWorkspaceProvisioner::class)->ensureDefault($this->actor)->id)->firstOrFail();
        $firstExpiry = $sub->expires_at->getTimestamp();

        // Second purchase (same plan, same period) while active → renewal.
        $quote2 = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-r2')['quote'];
        $order2 = $this->orders()->convert($this->actor, $owner, $quote2, 'c-r2')['order'];
        $init2 = $this->payments()->initiate($this->actor, $owner, $order2, 'i-r2');
        parse_str(parse_url($init2['redirect_url'], PHP_URL_QUERY), $q2);
        $q2['sandbox'] = 'settle';
        $this->payments()->verifyAndFinalize($this->actor, $init2['payment'], $q2);
        $this->payments()->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $sub->refresh();
        // Renewal stacked: new expiry = first expiry + 30 days, not "now + 30".
        $expectedExpiry = CarbonImmutable::instance($sub->expires_at);
        $this->assertSame((int) (30 * 24 * 60 * 60), $expectedExpiry->getTimestamp() - $firstExpiry);
        $periods = $sub->periods()->orderBy('id')->get();
        $this->assertCount(2, $periods);
        $this->assertSame(SubscriptionPeriod::OPERATION_PAID_ACTIVATION, $periods[0]->operation);
        $this->assertSame(SubscriptionPeriod::OPERATION_PAID_RENEWAL, $periods[1]->operation);
    }

    // ---- M4: seven-day grace + Free transition ----

    public function test_seven_day_grace_then_free_transition_preserves_data(): void
    {
        $v = $this->publishVersion('pexp', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-g')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-g')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-g');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $q);
        $f = app(SubscriptionFulfillment::class);
        $this->payments()->dispatchOutbox(fn (CoreBillingFulfillmentOutbox $e) => $f->fulfillPaid($e));
        $sub = CoreSubscription::query()->where('personal_workspace_id', app(PersonalWorkspaceProvisioner::class)->ensureDefault($this->actor)->id)->firstOrFail();

        // Fast-forward: expire term → grace → past grace.
        $pastGrace = CarbonImmutable::instance($sub->grace_ends_at)->addSeconds(1);
        $result = $f->sweep($pastGrace);
        $this->assertSame(1, $result['expired_to_free']);
        $sub->refresh();
        // Plan should now be the Free plan.
        $freeKey = (string) config('billing.free.personal_plan_key');
        $this->assertSame($freeKey, $sub->planVersion->plan->key);
        $this->assertSame(SubscriptionState::Active, app(SubscriptionLifecycle::class)->evaluate($sub));
        // Period history preserved (the grace-expiry-free period is appended).
        $this->assertTrue($sub->periods()->count() >= 2);
    }

    // ---- S4 regression: promo redeemed exactly once on successful payment ----

    public function test_promo_redemption_happens_once_on_paid(): void
    {
        $this->activateTax(0);
        $promo = $this->createPromo('PAY1', 'percent', 1000, null, maxRedemptions: 1); // 10%
        $v = $this->publishVersion('promo', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 1_000_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', 'PAY1', 'k-pro')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-pro')['order'];
        $init = $this->payments()->initiate($this->actor, $owner, $order, 'i-pro');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $this->payments()->verifyAndFinalize($this->actor, $init['payment'], $q);
        $res = CorePromoReservation::query()->where('order_id', $order->id)->first();
        $this->assertNotNull($res);
        $this->assertSame(CorePromoReservation::STATE_REDEEMED, $res->state);
    }

    // ---- helpers ----

    private function payments(): PaymentService
    {
        return app(PaymentService::class);
    }

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

    private function publishVersion(string $planKey, string $audience, array $pricesByPeriod): CorePlanVersion
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

    private function createPlanIfMissing(string $key, string $audience, int $version): void
    {
        $provisioner = app(PlanProvisioner::class);
        $plan = CorePlan::query()->where('key', $key)->first();
        if ($plan !== null) {
            return;
        }
        $provisioner->createPlan($key, "Plan {$key}", $audience);
        $provisioner->createDraftVersion($key, $version);
        $provisioner->publish($key, $version);
        $provisioner->setPlanStatus($key, CorePlan::STATUS_ACTIVE);
    }
}
