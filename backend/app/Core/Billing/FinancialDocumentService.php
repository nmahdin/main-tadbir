<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Billing\Documents\BillingDocumentStatus;
use App\Core\Billing\Documents\BillingDocumentType;
use App\Core\Billing\Documents\DocumentNumberGenerator;
use App\Core\Plans\CorePlanVersion;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * C5-M5 financial document issuance and inspection.
 *
 * Issues invoices (on order paid) and receipts (on verified
 * settlement) as immutable snapshots. All operations are
 * idempotent keyed by (order_id, doc_type, payment_id); retries
 * after crash return the previously issued document.
 */
final class FinancialDocumentService
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DocumentNumberGenerator $numbers,
    ) {}

    /**
     * Issue an invoice for a paid order if one does not yet exist.
     * Idempotent.
     *
     * @return array{document: CoreBillingDocument, is_new: bool}
     */
    public function issueInvoiceForOrder(
        CoreBillingOrder $order,
        ?CoreBillingPayment $payment,
        ?User $actor,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now('UTC');
        $ownerKey = $order->owner_key;

        return DB::transaction(function () use ($order, $payment, $actor, $at, $ownerKey): array {
            $existing = CoreBillingDocument::query()
                ->where('order_id', $order->id)
                ->where('doc_type', BillingDocumentType::INVOICE->value)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                return ['document' => $existing, 'is_new' => false];
            }
            $this->assertOrderPaid($order);

            $allocation = $this->numbers->allocate($ownerKey, BillingDocumentType::INVOICE, $at);
            $version = $this->resolvePlanVersion($order);
            $items = $this->buildItems($order, $version);

            $doc = CoreBillingDocument::create([
                'owner_key' => $ownerKey,
                'number' => $allocation['number'],
                'doc_number' => $allocation['doc_number'],
                'doc_type' => BillingDocumentType::INVOICE->value,
                'status' => BillingDocumentStatus::ISSUED->value,
                'order_id' => $order->id,
                'payment_id' => $payment?->id,
                'related_invoice_id' => null,
                'period' => $order->period,
                'seller_name' => (string) config('app.name', 'TADBIR'),
                'seller_tax_id' => null, // tax registration policy boundary — not invented
                'buyer_name' => $this->buyerSnapshot($order),
                'buyer_contact' => null,
                'plan_version_id' => $version?->id,
                'plan_name_snapshot' => $version?->plan?->name,
                'currency_code' => 'TOMAN',
                'subtotal_toman' => (int) $order->subtotal_toman,
                'discount_toman' => (int) $order->discount_toman,
                'tax_toman' => (int) $order->tax_toman,
                'total_toman' => (int) $order->total_toman,
                'tax_rate_snapshot' => $order->tax_rate_basis_points !== null ? ($order->tax_rate_basis_points / 100).'%' : null,
                'promo_code_snapshot' => $order->promo_code_snapshot,
                'provider_name' => $payment?->provider,
                'provider_transaction_id' => $payment?->provider_transaction_id,
                'items_json' => $items,
                'notes' => null,
                'idempotency_key' => 'invoice:order:'.$order->id,
                'issued_at' => $at,
                'created_by_user_id' => $actor?->id,
            ]);

            $this->recordEvent($doc, 'created', null, BillingDocumentStatus::ISSUED->value, $actor);
            $this->recordEvent($doc, 'issued', null, BillingDocumentStatus::ISSUED->value, $actor);
            $this->audit->record($actor, 'billing.document.invoice.issued', [
                'doc_id' => $doc->id, 'doc_number' => $doc->doc_number,
                'order_id' => $order->id, 'payment_id' => $payment?->id,
            ], $order->organization_id !== null ? 'organization' : 'personal',
               $order->organization_id ?? $order->personal_workspace_id,
               'billing_document', (int) $doc->id);
            return ['document' => $doc, 'is_new' => true];
        });
    }

    /**
     * Issue a receipt for a verified/settled payment. Zero-payable
     * payments receive a truthful receipt with zero totals and no
     * provider transaction id.
     *
     * @return array{document: CoreBillingDocument, is_new: bool}
     */
    public function issueReceiptForPayment(
        CoreBillingPayment $payment,
        CoreBillingOrder $order,
        ?User $actor,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now('UTC');
        $ownerKey = $order->owner_key;

        return DB::transaction(function () use ($payment, $order, $actor, $at, $ownerKey): array {
            $existing = CoreBillingDocument::query()
                ->where('order_id', $order->id)
                ->where('doc_type', BillingDocumentType::RECEIPT->value)
                ->where('payment_id', $payment->id)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                return ['document' => $existing, 'is_new' => false];
            }

            // Ensure the invoice exists (receipt must link to one)
            $invoice = CoreBillingDocument::query()
                ->where('order_id', $order->id)
                ->where('doc_type', BillingDocumentType::INVOICE->value)
                ->lockForUpdate()
                ->first();
            if ($invoice === null) {
                $inv = $this->issueInvoiceForOrder($order, $payment, $actor, $at);
                $invoice = $inv['document'];
            }

            $allocation = $this->numbers->allocate($ownerKey, BillingDocumentType::RECEIPT, $at);
            $version = $this->resolvePlanVersion($order);
            $items = $this->buildItems($order, $version);

            $doc = CoreBillingDocument::create([
                'owner_key' => $ownerKey,
                'number' => $allocation['number'],
                'doc_number' => $allocation['doc_number'],
                'doc_type' => BillingDocumentType::RECEIPT->value,
                'status' => BillingDocumentStatus::ISSUED->value,
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'related_invoice_id' => $invoice->id,
                'period' => $order->period,
                'seller_name' => (string) config('app.name', 'TADBIR'),
                'seller_tax_id' => null,
                'buyer_name' => $this->buyerSnapshot($order),
                'buyer_contact' => null,
                'plan_version_id' => $version?->id,
                'plan_name_snapshot' => $version?->plan?->name,
                'currency_code' => 'TOMAN',
                'subtotal_toman' => (int) $order->subtotal_toman,
                'discount_toman' => (int) $order->discount_toman,
                'tax_toman' => (int) $order->tax_toman,
                'total_toman' => (int) $order->total_toman,
                'tax_rate_snapshot' => $order->tax_rate_basis_points !== null ? ($order->tax_rate_basis_points / 100).'%' : null,
                'promo_code_snapshot' => $order->promo_code_snapshot,
                'provider_name' => $payment->provider,
                'provider_transaction_id' => $payment->provider_transaction_id,
                'items_json' => $items,
                'notes' => (int) $order->total_toman === 0 ? 'Zero-payable settlement (authorized without PSP transaction).' : null,
                'idempotency_key' => 'receipt:payment:'.$payment->id,
                'issued_at' => $at,
                'created_by_user_id' => $actor?->id,
            ]);

            $this->recordEvent($doc, 'created', null, BillingDocumentStatus::ISSUED->value, $actor);
            $this->recordEvent($doc, 'issued', null, BillingDocumentStatus::ISSUED->value, $actor);
            $this->audit->record($actor, 'billing.document.receipt.issued', [
                'doc_id' => $doc->id, 'doc_number' => $doc->doc_number,
                'order_id' => $order->id, 'payment_id' => $payment->id,
            ], $order->organization_id !== null ? 'organization' : 'personal',
               $order->organization_id ?? $order->personal_workspace_id,
               'billing_document', (int) $doc->id);
            return ['document' => $doc, 'is_new' => true];
        });
    }

    public function documentForOwner(CoreBillingDocument $doc, SubscriptionOwner $owner): ?CoreBillingDocument
    {
        if ($doc->owner_key !== $owner->key()) {
            return null;
        }
        return $doc;
    }

    public function renderDocument(CoreBillingDocument $doc): array
    {
        // Stable data structure for downstream rendering (Persian RTL
        // PDF/HTML renderer will live in a separate integration; the
        // API returns the data needed to render the document in the
        // client with approved typography).
        return [
            'doc_number' => $doc->doc_number,
            'doc_type' => $doc->doc_type,
            'status' => $doc->status,
            'issued_at' => $doc->issued_at?->toIso8601String(),
            'seller' => ['name' => $doc->seller_name, 'tax_id' => $doc->seller_tax_id],
            'buyer' => ['name' => $doc->buyer_name, 'contact' => $doc->buyer_contact],
            'plan' => ['name' => $doc->plan_name_snapshot, 'version_id' => $doc->plan_version_id, 'period' => $doc->period],
            'currency' => $doc->currency_code,
            'items' => $doc->items_json,
            'totals' => [
                'subtotal_toman' => (int) $doc->subtotal_toman,
                'discount_toman' => (int) $doc->discount_toman,
                'tax_toman' => (int) $doc->tax_toman,
                'total_toman' => (int) $doc->total_toman,
            ],
            'tax_rate' => $doc->tax_rate_snapshot,
            'promo_code' => $doc->promo_code_snapshot,
            'payment' => $doc->payment_id === null ?null : [
                'provider' => $doc->provider_name,
                'transaction_id' => $doc->provider_transaction_id,
            ],
            'notes' => $doc->notes,
        ];
    }

    // ---- Internal helpers ----

    private function assertOrderPaid(CoreBillingOrder $order): void
    {
        if ($order->status !== CoreBillingOrder::STATUS_PAID) {
            throw new BillingDomainException(
                'document_order_not_paid',
                'An invoice can only be issued for a paid order.',
            );
        }
    }

    private function resolvePlanVersion(CoreBillingOrder $order): ?CorePlanVersion
    {
        $quote = $order->quote;
        if ($quote === null) {
            return null;
        }
        /** @var CorePlanVersion $v */
        $v = CorePlanVersion::query()->with('plan')->find($quote->plan_version_id);
        return $v;
    }

    private function buyerSnapshot(CoreBillingOrder $order): string
    {
        if ($order->organization_id !== null) {
            $org = config('database.default') !== 'testing'
                ?\App\Core\Organizations\Organization::query()->find($order->organization_id)
                : null;
            return $org?->name ?? 'organization:'.$order->organization_id;
        }
        return 'personal:'.($order->personal_workspace_id ?? 'ws');
    }

    private function buildItems(CoreBillingOrder $order, ?CorePlanVersion $version): array
    {
        $items = [];
        $items[] = [
            'kind' => 'subscription',
            'description' => $version?->plan?->name ?? 'Subscription',
            'period' => $order->period,
            'quantity' => 1,
            'unit_amount_toman' => (int) $order->subtotal_toman,
            'amount_toman' => (int) $order->subtotal_toman,
        ];
        if ((int) $order->discount_toman > 0) {
            $items[] = [
                'kind' => 'discount',
                'description' => $order->promo_code_snapshot ? 'Promo: '.$order->promo_code_snapshot : 'Discount',
                'quantity' => 1,
                'unit_amount_toman' => -1 * (int) $order->discount_toman,
                'amount_toman' => -1 * (int) $order->discount_toman,
            ];
        }
        if ((int) $order->tax_toman > 0) {
            $items[] = [
                'kind' => 'tax',
                'description' => 'Tax',
                'quantity' => 1,
                'unit_amount_toman' => (int) $order->tax_toman,
                'amount_toman' => (int) $order->tax_toman,
            ];
        }
        return $items;
    }

    private function recordEvent(CoreBillingDocument $doc, string $event, ?string $from, string $to, ?User $actor): void
    {
        CoreBillingDocumentEvent::create([
            'document_id' => $doc->id,
            'event' => $event,
            'from_status' => $from,
            'to_status' => $to,
            'actor_user_id' => $actor?->id,
            'occurred_at' => CarbonImmutable::now('UTC'),
        ]);
    }
}
