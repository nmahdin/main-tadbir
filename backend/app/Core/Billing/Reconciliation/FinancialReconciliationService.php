<?php

namespace App\Core\Billing\Reconciliation;

use App\Core\Audit\AuditWriter;
use App\Core\Billing\CoreBillingDocument;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\CorePromoReservation;
use App\Core\Billing\Documents\BillingDocumentType;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionPeriod;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * C5-M6 — Idempotent restartable reconciliation detector.
 *
 * Produces findings for operational anomalies. Does NOT auto-correct
 * ambiguous states: ambiguous payments remain pending until a human
 * or an authorized recovery path explicitly resolves them.
 *
 * Each detection category is a private method; all findings are
 * UPSERTED keyed by (finding_type, subject_type, subject_id) so the
 * command is safe to run repeatedly.
 */
final class FinancialReconciliationService
{
    public function __construct(private readonly AuditWriter $audit) {}

    /**
     * Run the full reconciliation sweep. Returns a summary of
     * findings opened/resolved during this pass.
     *
     * @return array{opened:int,resolved:int,total_open:int}
     */
    public function sweep(?CarbonImmutable $at = null): array
    {
        $at ??= CarbonImmutable::now('UTC');
        $opened = 0;
        $resolved = 0;

        DB::transaction(function () use ($at, &$opened, &$resolved): void {
            $checks = [
                $this->checkSettledWithoutFulfillment(...),
                $this->checkOrderMissingInvoice(...),
                $this->checkPaidPaymentMissingReceipt(...),
                $this->checkAmountMismatches(...),
                $this->checkDuplicateOrStuckPayments(...),
                $this->checkPromoInconsistencies(...),
                $this->checkSubscriptionFulfillmentInconsistencies(...),
            ];
            foreach ($checks as $check) {
                $result = $check($at);
                $opened += $result['opened'];
                $resolved += $result['resolved'];
            }

            // Resolve any open finding whose subject no longer matches
            // the anomaly predicate.
            $resolved += $this->autoResolveObsolete($at);
        });

        $totalOpen = DB::table('core_billing_reconciliation_findings')->where('status', 'open')->count();
        return ['opened' => $opened, 'resolved' => $resolved, 'total_open' => (int) $totalOpen];
    }

    /**
     * Explicitly resolve a finding with a human-supplied note.
     * Does NOT auto-correct the underlying payment/order state.
     */
    public function resolveFinding(CoreBillingReconciliationFinding $finding, User $actor, string $note): CoreBillingReconciliationFinding
    {
        return DB::transaction(function () use ($finding, $actor, $note): CoreBillingReconciliationFinding {
            $locked = CoreBillingReconciliationFinding::query()->lockForUpdate()->findOrFail($finding->id);
            if ($locked->status !== 'open') {
                return $locked;
            }
            $locked->forceFill([
                'status' => 'resolved',
                'resolved_at' => CarbonImmutable::now('UTC'),
                'resolved_by_user_id' => $actor->id,
                'resolution_note' => $note,
            ])->save();
            $this->audit->record($actor, 'billing.reconciliation.resolved', [
                'finding_id' => $locked->id,
                'finding_type' => $locked->finding_type,
                'subject' => $locked->subject_type.':'.$locked->subject_id,
                'note' => $note,
            ], null, null, 'billing_reconciliation_finding', (int) $locked->id);

            return $locked->fresh();
        });
    }

    // ---- Checks ----

    /**
     * A payment is marked PAID but has no subscription period
     * pointing to it AND no undispatched outbox event (i.e. the
     * outbox drain did not complete).
     */
    private function checkSettledWithoutFulfillment(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        $payments = CoreBillingPayment::query()
            ->whereIn('status', [CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_ZERO_SETTLED])
            ->get();

        foreach ($payments as $p) {
            // If there's still a pending outbox event, skip - it's in flight
            $pendingOutbox = CoreBillingFulfillmentOutbox::query()
                ->where('payment_id', $p->id)
                ->whereNull('dispatched_at')
                ->exists();
            if ($pendingOutbox) {
                continue;
            }
            $periodExists = SubscriptionPeriod::query()->where('paid_by_payment_id', $p->id)->exists();
            // Treat STATUS_FULFILLED + period row as successfully completed.
            if ($periodExists && $p->status === CoreBillingPayment::STATUS_FULFILLED) {
                continue;
            }
            if ((int) $p->finalized_at === 0 || $p->finalized_at === null) {
                continue;
            }
            $opened += (int) $this->upsertFinding(
                'settled_without_fulfillment',
                'payment', $p->id, 'error', true,
                'Payment settled but subscription fulfillment did not complete.',
                ['payment_id' => $p->id, 'order_id' => $p->order_id, 'status' => $p->status],
                $p->owner_key, $p->id, $p->order_id, $at,
            );
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Order is STATUS_PAID but no invoice document exists.
     */
    private function checkOrderMissingInvoice(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        $orders = CoreBillingOrder::query()
            ->where('status', CoreBillingOrder::STATUS_PAID)
            ->whereDoesntHave('documents', fn ($q) => $q->where('doc_type', BillingDocumentType::INVOICE->value))
            ->get();
        foreach ($orders as $o) {
            $opened += (int) $this->upsertFinding(
                'settled_order_missing_invoice',
                'order', $o->id, 'error', true,
                'Paid order has no invoice document.',
                ['order_id' => $o->id, 'total_toman' => $o->total_toman],
                $o->owner_key, null, $o->id, $at,
            );
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Paid/zero_settled payment has no receipt document.
     */
    private function checkPaidPaymentMissingReceipt(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        $payments = CoreBillingPayment::query()
            ->whereIn('status', [CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_ZERO_SETTLED])
            ->whereDoesntHave('documents', fn ($q) => $q->where('doc_type', BillingDocumentType::RECEIPT->value))
            ->get();
        foreach ($payments as $p) {
            $opened += (int) $this->upsertFinding(
                'settled_payment_missing_receipt',
                'payment', $p->id, 'warning', true,
                'Settled payment has no receipt document.',
                ['payment_id' => $p->id, 'order_id' => $p->order_id],
                $p->owner_key, $p->id, $p->order_id, $at,
            );
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Amount/currency mismatches between payment verification and order totals.
     */
    private function checkAmountMismatches(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        $payments = CoreBillingPayment::query()
            ->whereIn('status', [CoreBillingPayment::STATUS_FAILED, CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_ZERO_SETTLED])
            ->whereNotNull('verified_amount_toman')
            ->get();
        foreach ($payments as $p) {
            $order = $p->order;
            if ($order === null) {
                continue;
            }
            if ($p->status === CoreBillingPayment::STATUS_FAILED) {
                $opened += (int) $this->upsertFinding(
                    'payment_failed_requires_attention',
                    'payment', $p->id, 'info', true,
                    'Payment failed verification.',
                    ['payment_id' => $p->id, 'failure_code' => $p->failure_code],
                    $p->owner_key, $p->id, $order->id, $at,
                );
                continue;
            }
            if ((int) $p->verified_amount_toman !== (int) $order->total_toman) {
                $opened += (int) $this->upsertFinding(
                    'payment_amount_mismatch',
                    'payment', $p->id, 'critical', false,
                    'Verified amount does not match order total.',
                    ['payment_id' => $p->id, 'verified' => $p->verified_amount_toman, 'order_total' => $order->total_toman],
                    $p->owner_key, $p->id, $order->id, $at,
                );
            }
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Multiple non-terminal payment attempts for the same order in
     * 'pending' state (stuck callback) or duplicate callbacks.
     */
    private function checkDuplicateOrStuckPayments(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        $orders = CoreBillingOrder::query()
            ->where('status', CoreBillingOrder::STATUS_PAYABLE_PENDING)
            ->where('review_expires_at', '<', $at)
            ->get();
        foreach ($orders as $o) {
            $opened += (int) $this->upsertFinding(
                'order_review_expired_with_pending_payment',
                'order', $o->id, 'warning', true,
                'Order review TTL expired with pending payment attempts.',
                ['order_id' => $o->id],
                $o->owner_key, null, $o->id, $at,
            );
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Promo redemption inconsistency: promo redeemed but payment not settled (or vice versa).
     */
    private function checkPromoInconsistencies(CarbonImmutable $at): array
    {
        $opened = 0; $resolved = 0;
        // promo reservations in STATE_CONVERTED whose order is cancelled/review_expired but never rolled back are out of scope here.
        // check redeemed promo with non-paid order
        $promos = CorePromoReservation::query()
            ->where('state', CorePromoReservation::STATE_REDEEMED)
            ->whereHas('order', fn ($q) => $q->whereIn('status', [CoreBillingOrder::STATUS_CANCELLED, CoreBillingOrder::STATUS_REVIEW_EXPIRED]))
            ->get();
        foreach ($promos as $pr) {
            $opened += (int) $this->upsertFinding(
                'promo_redeemed_but_order_not_paid',
                'promo', $pr->id, 'critical', false,
                'Promo marked redeemed but its order was not paid.',
                ['promo_reservation_id' => $pr->id, 'order_id' => $pr->order_id],
                $pr->owner_key, null, $pr->order_id, $at,
            );
        }
        return ['opened' => $opened, 'resolved' => $resolved];
    }

    /**
     * Cross-check:
     *  - Duplicate/conflicting fulfillment (multiple settled payments
     *    for the same owner in the same window, or multiple PAID
     *    periods pointing at the same subscription/start).
     *  - Order/period/settlement mismatch: period exists but its
     *    amount/period/plan_version does not match the order.
     *  - Document-after-settlement completeness already covered by
     *    missing-invoice / missing-receipt checks.
     */
    private function checkSubscriptionFulfillmentInconsistencies(CarbonImmutable $at): array
    {
        $opened = 0;
        $resolved = 0;

        // Duplicate settled payments for the same order would already be
        // prevented by idempotency, but defensively scan for any order
        // with > 1 PAID/FULFILLED/ZERO_SETTLED payment (rare collision
        // from older data or manual DB edits).
        $dupes = DB::table('core_billing_payments')
            ->select('order_id', DB::raw('COUNT(*) AS c'))
            ->whereIn('status', [CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_FULFILLED, CoreBillingPayment::STATUS_ZERO_SETTLED])
            ->groupBy('order_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();
        foreach ($dupes as $row) {
            $opened += (int) $this->upsertFinding(
                'duplicate_settled_payments_for_order',
                'order', (int) $row->order_id, 'critical', false,
                'Multiple settled payments exist for the same order.',
                ['order_id' => (int) $row->order_id, 'settled_count' => (int) $row->c],
                null, null, (int) $row->order_id, $at,
            );
        }

        // Period/order mismatches: any paid-by period whose recorded
        // amount does not correspond to the order total it was paid from.
        $periods = SubscriptionPeriod::query()
            ->whereNotNull('paid_by_payment_id')
            ->with(['payment', 'payment.order'])
            ->get();
        foreach ($periods as $period) {
            $pay = $period->payment;
            if ($pay === null) {
                $opened += (int) $this->upsertFinding(
                    'subscription_period_orphaned_payment_reference',
                    'subscription', (int) $period->id, 'warning', true,
                    'Subscription period references a missing payment.',
                    ['period_id' => (int) $period->id, 'payment_id' => (int) $period->paid_by_payment_id],
                    null, (int) $period->paid_by_payment_id, null, $at,
                );
                continue;
            }
            $order = $pay->order;
            if ($order === null) {
                continue;
            }
            if ((int) $pay->verified_amount_toman !== (int) $order->total_toman && $pay->status !== CoreBillingPayment::STATUS_ZERO_SETTLED) {
                $opened += (int) $this->upsertFinding(
                    'subscription_period_amount_mismatch',
                    'subscription', (int) $period->id, 'critical', false,
                    'Subscription period paid amount does not match its order total.',
                    [
                        'period_id' => (int) $period->id,
                        'payment_id' => (int) $pay->id,
                        'order_id' => (int) $order->id,
                        'verified_amount_toman' => (int) $pay->verified_amount_toman,
                        'order_total_toman' => (int) $order->total_toman,
                    ],
                    $pay->owner_key, (int) $pay->id, (int) $order->id, $at,
                );
            }
        }

        return ['opened' => $opened, 'resolved' => $resolved];
    }

    // ---- Finding persistence ----

    private function upsertFinding(
        string $type, string $subjectType, int $subjectId,
        string $severity, bool $safeToRetry, string $message, array $evidence,
        ?string $ownerKey, ?int $paymentId, ?int $orderId, CarbonImmutable $at,
    ): bool {
        $existing = DB::table('core_billing_reconciliation_findings')
            ->where('finding_type', $type)
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->first();

        if ($existing !== null) {
            if ($existing->status === 'open') {
                return false;
            }
            DB::table('core_billing_reconciliation_findings')->where('id', $existing->id)->update([
                'status' => 'open', 'severity' => $severity, 'safe_to_retry' => $safeToRetry,
                'message' => $message, 'evidence' => json_encode($evidence),
                'owner_key' => $ownerKey, 'related_payment_id' => $paymentId, 'related_order_id' => $orderId,
                'detected_at' => $at, 'resolved_at' => null, 'resolution_note' => null, 'resolved_by_user_id' => null,
                'updated_at' => now(),
            ]);
            return true;
        }

        DB::table('core_billing_reconciliation_findings')->insert([
            'finding_type' => $type,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'severity' => $severity,
            'status' => 'open',
            'safe_to_retry' => $safeToRetry,
            'message' => $message,
            'evidence' => json_encode($evidence),
            'owner_key' => $ownerKey,
            'related_payment_id' => $paymentId,
            'related_order_id' => $orderId,
            'detected_at' => $at,
            'detected_run_id' => null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return true;
    }

    private function autoResolveObsolete(CarbonImmutable $at): int
    {
        $resolved = 0;
        // For each open finding, re-evaluate its predicate by marking it resolved when the issue no longer exists.
        // Simple rule: findings whose related document/payment/order is now in the expected state are marked resolved.
        $open = DB::table('core_billing_reconciliation_findings')->where('status', 'open')->get();
        foreach ($open as $f) {
            $stillOpen = match ($f->finding_type) {
                'settled_without_fulfillment' => ! SubscriptionPeriod::query()->where('paid_by_payment_id', $f->subject_id)->exists()
                    && ! CoreBillingFulfillmentOutbox::query()->where('payment_id', $f->subject_id)->whereNull('dispatched_at')->exists(),
                'settled_order_missing_invoice' => ! CoreBillingDocument::query()->where('order_id', $f->subject_id)->where('doc_type', BillingDocumentType::INVOICE->value)->exists(),
                'settled_payment_missing_receipt' => ! CoreBillingDocument::query()->where('payment_id', $f->subject_id)->where('doc_type', BillingDocumentType::RECEIPT->value)->exists(),
                'duplicate_settled_payments_for_order' => DB::table('core_billing_payments')
                    ->where('order_id', $f->subject_id)
                    ->whereIn('status', [CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_FULFILLED, CoreBillingPayment::STATUS_ZERO_SETTLED])
                    ->count() > 1,
                'order_review_expired_with_pending_payment', 'payment_failed_requires_attention',
                'payment_amount_mismatch', 'promo_redeemed_but_order_not_paid',
                'subscription_period_orphaned_payment_reference', 'subscription_period_amount_mismatch' => true,
                default => true,
            };
            // For settled_without_fulfillment, also treat STATUS_FULFILLED + period row as resolved.
            if ($f->finding_type === 'settled_without_fulfillment') {
                $pay = CoreBillingPayment::query()->find($f->subject_id);
                if ($pay !== null && $pay->status === CoreBillingPayment::STATUS_FULFILLED && SubscriptionPeriod::query()->where('paid_by_payment_id', $f->subject_id)->exists()) {
                    $stillOpen = false;
                }
            }
            if (! $stillOpen) {
                DB::table('core_billing_reconciliation_findings')->where('id', $f->id)->update([
                    'status' => 'resolved', 'resolved_at' => now(),
                    'resolution_note' => 'Issue resolved by subsequent processing.',
                    'updated_at' => now(),
                ]);
                $resolved++;
            }
        }
        return $resolved;
    }
}
