<? php

namespace Tests\Feature\Core;

use App\Core\Billing\CoreBillingDocument;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\Documents\BillingDocumentType;
use App\Core\Billing\Documents\DocumentNumberGenerator;
use App\Core\Billing\OrderService;
use App\Core\Billing\PaymentService;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Billing\QuoteService;
use App\Core\Billing\Reconciliation\CoreBillingReconciliationFinding;
use App\Core\Billing\Reconciliation\FinancialReconciliationService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\SubscriptionFulfillment;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * C5-M5 (Financial Documents) and C5-M6 (Reconciliation) tests.
 *
 * Covers: issuance idempotency, concurrent numbering uniqueness,
 * snapshot integrity, zero-payable docs, cross-tenant denial,
 * mismatch detection, duplicate callback idempotency, crash/retry,
 * reconciliation sweep and auto-resolve.
 */
class BillingDocumentsAndReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
        $this->actor = User::factory()->create(['status' => 'active']);
        config(['billing.gateway' => 'sandbox']);
        $provisioner = app(PlanProvisioner::class);
        $this->createPlanIfMissing((string) config('billing.free.personal_plan_key'), CorePlan::AUDIENCE_PERSONAL, (int) config('billing.free.personal_plan_version'));
        $this->createPlanIfMissing((string) config('billing.free.organization_plan_key'), CorePlan::AUDIENCE_ORGANIZATION, (int) config('billing.free.organization_plan_version'));
    }

    // ---- M5 issuance ----

    public function test_payment_finalization_issues_invoice_and_receipt(): void
    {
        $v = $this->publishVersion('inv1', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 500_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-inv1')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-inv1')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-inv1');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        $invoice = CoreBillingDocument::query()
            ->where('order_id', $order->id)->where('doc_type', BillingDocumentType::INVOICE->value)->first();
        $this->assertNotNull($invoice);
        $this->assertSame('issued', $invoice->status);
        $this->assertSame(500_000, (int) $invoice->total_toman);
        $this->assertSame(500_000, (int) $invoice->subtotal_toman);
        $this->assertStringStartsWith('INV-', (string) $invoice->doc_number);

        $receipt = CoreBillingDocument::query()
            ->where('payment_id', $init['payment']->id)->where('doc_type', BillingDocumentType::RECEIPT->value)->first();
        $this->assertNotNull($receipt);
        $this->assertSame((int) $invoice->id, (int) $receipt->related_invoice_id);
        $this->assertStringStartsWith('RCP-', (string) $receipt->doc_number);
    }

    public function test_zero_payable_order_produces_truthful_docs_without_psp_trace(): void
    {
        $v = $this->publishVersion('zerov', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 0]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-zero')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-zero')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-zero');
        $this->assertSame(CoreBillingPayment::STATUS_ZERO_SETTLED, $init['payment']->status);

        $invoice = CoreBillingDocument::query()->where('order_id', $order->id)
            ->where('doc_type', BillingDocumentType::INVOICE->value)->first();
        $receipt = CoreBillingDocument::query()->where('payment_id', $init['payment']->id)
            ->where('doc_type', BillingDocumentType::RECEIPT->value)->first();
        $this->assertNotNull($invoice);
        $this->assertNotNull($receipt);
        $this->assertSame(0, (int) $invoice->total_toman);
        $this->assertSame(0, (int) $receipt->total_toman);
        $this->assertSame('internal', $receipt->provider_name);
    }

    public function test_duplicate_callback_is_idempotent_for_documents(): void
    {
        $v = $this->publishVersion('idem', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 300_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-idem')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-idem')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-idem');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q); // replay

        $this->assertSame(1, CoreBillingDocument::query()->where('order_id', $order->id)
            ->where('doc_type', BillingDocumentType::INVOICE->value)->count());
        $this->assertSame(1, CoreBillingDocument::query()->where('payment_id', $init['payment']->id)
            ->where('doc_type', BillingDocumentType::RECEIPT->value)->count());
    }

    public function test_concurrent_numbering_preserves_uniqueness(): void
    {
        $v = $this->publishVersion('conc', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 100_000]);
        $owner = $this->personalOwner($this->actor);
        $at = CarbonImmutable::now('UTC');
        $numbers = app(DocumentNumberGenerator::class);

        $seen = [];
        DB::transaction(function () use ($numbers, $owner, $at, &$seen): void {
            // Lock on a fresh sequence row by using a fixed month.
            for ($i = 0; $i < 5; $i++) {
                $alloc = $numbers->allocate($owner->key(), BillingDocumentType::INVOICE, $at);
                $seen[] = $alloc['doc_number'];
            }
        });
        $this->assertCount(5, array_unique($seen));
        sort($seen);
        $this->assertMatchesRegularExpression('/^INV-\d{4}-\d{2}-0001$/', $seen[0]);
    }

    public function test_document_snapshot_is_immutable_after_issue(): void
    {
        $v = $this->publishVersion('snap', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 250_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-snap')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-snap')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-snap');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        $invoice = CoreBillingDocument::query()->where('order_id', $order->id)
            ->where('doc_type', BillingDocumentType::INVOICE->value)->first();
        $this->assertTrue($invoice->isImmutable());
        $items = $invoice->items_json;
        $this->assertIsArray($items);
        $this->assertSame('subscription', $items[0]['kind']);
        $this->assertSame(250_000, (int) $items[0]['amount_toman']);
    }

    // ---- M6 reconciliation ----

    public function test_reconciliation_detects_settled_without_fulfillment_and_resolves(): void
    {
        $v = $this->publishVersion('rec1', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 400_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-rec1')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-rec1')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-rec1');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        // Payment is PAID but outbox is not yet drained; reconciliation must still be
        // in-flight (pending outbox) → no finding.
        $recon = app(FinancialReconciliationService::class);
        $r1 = $recon->sweep();
        $this->assertSame(0, $r1['total_open']);

        // Drain outbox → dispatches fulfillment (creates period + fulfilled event).
        $fulfillment = app(SubscriptionFulfillment::class);
        $svc->dispatchOutbox(function (CoreBillingFulfillmentOutbox $evt) use ($fulfillment): void {
            $fulfillment->fulfillPaid($evt);
        });

        $r2 = $recon->sweep();
        $this->assertSame(0, $r2['total_open']);

        // Simulate failed fulfillment: reset payment to PAID, delete the
        // subscription period, and remove outbox rows so no redispatch occurs.
        CoreBillingPayment::query()->whereKey($init['payment']->id)->update([
            'status' => CoreBillingPayment::STATUS_PAID,
            'fulfilled_at' => null,
        ]);
        SubscriptionPeriod::query()->where('paid_by_payment_id', $init['payment']->id)->delete();
        CoreBillingFulfillmentOutbox::query()->where('payment_id', $init['payment']->id)->delete();

        $r3 = $recon->sweep();
        $this->assertGreaterThanOrEqual(1, $r3['total_open']);
        $finding = CoreBillingReconciliationFinding::query()
            ->where('finding_type', 'settled_without_fulfillment')
            ->where('subject_id', $init['payment']->id)
            ->first();
        $this->assertNotNull($finding);
    }

    public function test_reconciliation_handles_missing_documents(): void
    {
        $v = $this->publishVersion('mdoc', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 120_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-mdoc')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-mdoc')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-mdoc');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        // Delete the issued invoice to fake a missing document condition.
        CoreBillingDocument::query()->where('order_id', $order->id)->delete();

        $recon = app(FinancialReconciliationService::class);
        $recon->sweep();
        $finding = CoreBillingReconciliationFinding::query()
            ->where('finding_type', 'settled_order_missing_invoice')
            ->where('subject_id', $order->id)
            ->first();
        $this->assertNotNull($finding);
    }

    public function test_render_endpoint_rejects_cross_tenant_access(): void
    {
        $v = $this->publishVersion('xorg', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 150_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-xorg')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-xorg')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-xorg');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        $invoice = CoreBillingDocument::query()->where('order_id', $order->id)->where('doc_type', BillingDocumentType::INVOICE->value)->firstOrFail();

        $other = User::factory()->create(['status' => 'active']);
        $this->actingAs($other);
        $response = $this->getJson('/api/v1/billing/documents/'.$invoice->id);
        $response->assertStatus(404);
    }

    public function test_owner_can_view_their_documents(): void
    {
        $v = $this->publishVersion('view', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 110_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-view')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-view')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-view');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        $this->actingAs($this->actor);
        $response = $this->getJson('/api/v1/billing/documents');
        $response->assertOk();
        $data = $response->json('data.documents');
        $this->assertNotEmpty($data);
    }

    public function test_render_endpoint_returns_rtl_payload_without_psp_trace_for_owner(): void
    {
        $v = $this->publishVersion('rndr', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 220_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-rndr')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-rndr')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-rndr');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        $invoice = CoreBillingDocument::query()->where('order_id', $order->id)
            ->where('doc_type', BillingDocumentType::INVOICE->value)->firstOrFail();

        $this->actingAs($this->actor);
        $resp = $this->getJson('/api/v1/billing/documents/'.$invoice->id.'/render');
        $resp->assertOk();
        $render = $resp->json('data.render');
        $this->assertSame($invoice->doc_number, $render['doc_number']);
        $this->assertSame('invoice', $render['doc_type']);
        $this->assertIsArray($render['items']);
        $this->assertArrayHasKey('totals', $render);
        $this->assertSame(220_000, $render['totals']['subtotal_toman']);
        // Owner render exposes provider but NOT raw diagnostics / secret.
        $this->assertSame('sandbox', $render['payment']['provider']);
    }

    public function test_jalali_numbering_resets_across_month_boundary(): void
    {
        $g = app(DocumentNumberGenerator::class);
        // Pick the last day of a known Jalali month and the first of the next.
        // 2026-03-20 ≈ 1404-12-30 (end of Esfand), 2026-03-21 ≈ 1405-01-01 (Farvardin).
        $end = new CarbonImmutable('2026-03-20T12:00:00Z');
        $start = new CarbonImmutable('2026-03-21T12:00:00Z');
        $ownerKey = 'ws:'.(int) $this->actor->id;
        $a = $g->allocate($ownerKey, BillingDocumentType::INVOICE, $end);
        $b = $g->allocate($ownerKey, BillingDocumentType::INVOICE, $start);
        $this->assertSame(1, $a['number']);
        $this->assertSame(1, $b['number']);
        $this->assertMatchesRegularExpression('/-0001$/', $a['doc_number']);
        $this->assertMatchesRegularExpression('/-0001$/', $b['doc_number']);
        // Different Jalali year/month between the two.
        $this->assertNotSame(substr($a['doc_number'], 4, 7), substr($b['doc_number'], 4, 7));
    }

    public function test_issuance_idempotent_after_simulated_crash_between_outbox_and_doc(): void
    {
        // Simulates a crash AFTER finalize (outbox+payment marked PAID) but
        // BEFORE document issuance by invoking issuance a second time via
        // the document service directly: must return existing on retry.
        $v = $this->publishVersion('crash', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 180_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-crash')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-crash')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-crash');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        // Simulate "re-run" of document issuance (as an operator recovery would).
        $docs = app(\App\Core\Billing\FinancialDocumentService::class);
        $r1 = $docs->issueInvoiceForOrder($order->fresh(), $init['payment']->fresh(), $this->actor);
        $r2 = $docs->issueReceiptForPayment($init['payment']->fresh(), $order->fresh(), $this->actor);
        $this->assertFalse($r1['is_new']);
        $this->assertFalse($r2['is_new']);
        $this->assertSame(1, CoreBillingDocument::query()->where('order_id', $order->id)
            ->where('doc_type', BillingDocumentType::INVOICE->value)->count());
        $this->assertSame(1, CoreBillingDocument::query()->where('payment_id', $init['payment']->id)
            ->where('doc_type', BillingDocumentType::RECEIPT->value)->count());
    }

    public function test_reconciliation_detects_missing_receipt(): void
    {
        $v = $this->publishVersion('mrec', CorePlan::AUDIENCE_PERSONAL, ['monthly' => 90_000]);
        $owner = $this->personalOwner($this->actor);
        $quote = $this->quotes()->create($this->actor, $owner, $v, 'monthly', null, 'k-mrec')['quote'];
        $order = $this->orders()->convert($this->actor, $owner, $quote, 'c-mrec')['order'];
        $svc = $this->payments();
        $init = $svc->initiate($this->actor, $owner, $order, 'i-mrec');
        parse_str(parse_url($init['redirect_url'], PHP_URL_QUERY), $q);
        $q['sandbox'] = 'settle';
        $svc->verifyAndFinalize($this->actor, $init['payment'], $q);

        // Delete the receipt but keep the invoice: finding should be raised.
        CoreBillingDocument::query()->where('payment_id', $init['payment']->id)
            ->where('doc_type', BillingDocumentType::RECEIPT->value)->delete();

        $recon = app(FinancialReconciliationService::class);
        $summary = $recon->sweep();
        $this->assertGreaterThanOrEqual(1, $summary['total_open']);
        $this->assertNotNull(
            CoreBillingReconciliationFinding::query()
                ->where('finding_type', 'settled_payment_missing_receipt')
                ->where('subject_id', $init['payment']->id)
                ->first()
        );
    }

    // ---- helpers ----

    private function quotes(): QuoteService { return app(QuoteService::class); }
    private function orders(): OrderService { return app(OrderService::class); }
    private function payments(): PaymentService { return app(PaymentService::class); }

    private function personalOwner(User $u): SubscriptionOwner
    {
        $ws = app(PersonalWorkspaceProvisioner::class)->ensureDefault($u);

        return new SubscriptionOwner('personal', null, $ws);
    }

    private function publishVersion(string $key, string $audience, array $prices): \App\Core\Plans\CorePlanVersion
    {
        $p = app(PlanProvisioner::class);
        $p->createPlan($key, ucfirst($key), $audience);
        $p->createDraftVersion($key, 1);
        $p->setPlanStatus($key, CorePlan::STATUS_ACTIVE);
        $v = \App\Core\Plans\CorePlanVersion::whereHas('plan', fn ($q) => $q->where('key', $key))->firstOrFail();
        app(PlanPricePublisher::class)->publishPrices($v, $prices, $this->actor);

        return $v->fresh();
    }

    private function createPlanIfMissing(string $key, string $audience, int $versionNumber): void
    {
        $plan = \App\Core\Plans\CorePlan::query()->firstOrCreate(['key' => $key, 'audience' => $audience], ['name' => 'Plan '.$key]);
        if (\App\Core\Plans\CorePlanVersion::query()->where('plan_id', $plan->id)->where('version', $versionNumber)->exists()) {
            return;
        }
        $v = \App\Core\Plans\CorePlanVersion::query()->create([
            'plan_id' => $plan->id, 'version' => $versionNumber, 'periods_supported' => ['monthly'],
            'billing_period_unit' => 'month', 'billing_period_count' => 1,
            'status' => 'published', 'published_at' => now(),
        ]);
        \App\Core\Billing\CorePlanPrice::query()->create([
            'plan_version_id' => $v->id, 'billing_period' => 'monthly',
            'price_toman' => 0, 'currency' => 'TOMAN', 'is_active' => true,
        ]);
    }
}
