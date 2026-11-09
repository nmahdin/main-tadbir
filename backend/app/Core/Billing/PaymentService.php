<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Billing\Payments\InitiationRequest;
use App\Core\Billing\Payments\VerificationResult;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * C5-M3 — payment initiation, verification and atomic finalization
 * (SPEC-C5-M3 §5, §6).
 *
 * Lock order (documented in C5-M3/M4-REPORT):
 *   owner row (org or personal workspace) FOR UPDATE
 *     → order FOR UPDATE
 *     → payment FOR UPDATE
 *     → promo_reservation FOR UPDATE (via locked relation)
 *     → (on paid) core_billing_fulfillment_outbox INSERT
 *
 * Idempotency is keyed by (owner_key, idempotency_key). Retried
 * initiations return the existing payment attempt. A payment that
 * is already settled (paid/fulfilled/zero_settled) is returned
 * unchanged.
 */
final class PaymentService
{
    public function __construct(
        private readonly PaymentGateway $gateway,
        private readonly AuditWriter $audit,
        private readonly OrderService $orders,
    ) {}

    /**
     * Initiate a payment for an in_review order.
     *
     * @param string|null $returnUrl validated redirect destination; null = internal default.
     * @return array{payment: CoreBillingPayment, redirect_url: ?string, is_replay: bool}
     */
    public function initiate(
        User $actor,
        SubscriptionOwner $owner,
        CoreBillingOrder $order,
        string $idempotencyKey,
        ?string $returnUrl = null,
        ?string $method = null,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now('UTC');
        $ownerKey = CoreBillingPayment::ownerKeyFor($owner);
        $this->assertOrderOwnership($order, $ownerKey);

        // Idempotent replay by (owner, key) — return existing attempt.
        $existing = CoreBillingPayment::query()
            ->where('owner_key', $ownerKey)
            ->where('idempotency_key', $idempotencyKey)
            ->first();
        if ($existing !== null) {
            $this->rebuildRedirectIfNeeded($existing, $returnUrl);

            return ['payment' => $existing, 'redirect_url' => $this->redirectUrlFor($existing), 'is_replay' => true];
        }

        // Zero-amount orders skip the PSP entirely (M3 §7).
        if ((int) $order->total_toman === 0) {
            return $this->initiateZeroPayable($actor, $owner, $order, $idempotencyKey, $at);
        }

        return DB::transaction(function () use ($actor, $owner, $ownerKey, $order, $idempotencyKey, $returnUrl, $method, $at): array {
            $lockedOrder = $this->lockOrderForWrite($order);
            $this->assertOrderConvertible($lockedOrder, $at);

            // If an existing non-failed payment attempt already exists for this order, return it.
            $priorAttempt = CoreBillingPayment::query()
                ->where('order_id', $lockedOrder->id)
                ->whereIn('status', [CoreBillingPayment::STATUS_INITIATED, CoreBillingPayment::STATUS_PENDING, CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_FULFILLED])
                ->first();
            if ($priorAttempt !== null) {
                return ['payment' => $priorAttempt, 'redirect_url' => $this->redirectUrlFor($priorAttempt), 'is_replay' => true];
            }

            // Transition order in_review → payable_pending.
            if ($lockedOrder->status === CoreBillingOrder::STATUS_IN_REVIEW) {
                $lockedOrder->forceFill(['status' => CoreBillingOrder::STATUS_PAYABLE_PENDING])->save();
            }

            $payment = CoreBillingPayment::create([
                'order_id' => (int) $lockedOrder->id,
                'owner_key' => $ownerKey,
                'organization_id' => $owner->type === 'organization' ? (int) $owner->organization->id : null,
                'personal_workspace_id' => $owner->type === 'personal' ? (int) $owner->personalWorkspace->id : null,
                'idempotency_key' => $idempotencyKey,
                'payload_hash' => hash('sha256', implode('|', ['v1', 'pay', (string) $lockedOrder->id, (string) $lockedOrder->total_toman])),
                'provider' => $this->gateway->name(),
                'provider_method' => $method ?? 'redirect',
                'requested_amount_toman' => (int) $lockedOrder->total_toman,
                'requested_currency' => 'TOMAN',
                'status' => CoreBillingPayment::STATUS_INITIATED,
                'return_url' => $returnUrl,
                'created_by_user_id' => $actor->id,
                'initiated_at' => $at,
            ]);

            $this->recordEvent($payment, 'initiated', null, CoreBillingPayment::STATUS_INITIATED, [
                'order_id' => (int) $lockedOrder->id,
                'amount_toman' => (int) $lockedOrder->total_toman,
            ], $actor);

            $req = new InitiationRequest(
                (int) $payment->requested_amount_toman,
                (string) $payment->requested_currency,
                'Order #'.$payment->id,
                $this->publicCallbackUrl($payment),
            );

            $result = $this->gateway->initiate($payment, $req);
            $diag = $this->gateway->redactDiagnostics($result->diagnostics);

            if (! $result->ok) {
                $payment->forceFill([
                    'status' => CoreBillingPayment::STATUS_FAILED,
                    'failure_code' => $result->errorCode,
                    'failure_reason' => $result->errorMessage,
                    'finalized_at' => $at,
                ])->save();
                $this->recordEvent($payment, 'initiation_failed', CoreBillingPayment::STATUS_INITIATED, CoreBillingPayment::STATUS_FAILED, [
                    'code' => $result->errorCode,
                    'message' => $result->errorMessage,
                    'diagnostics' => $diag,
                ], $actor);

                return ['payment' => $payment, 'redirect_url' => null, 'is_replay' => false, 'error' => $result->errorCode];
            }

            $payment->forceFill([
                'provider_payment_id' => $result->providerPaymentId,
                'provider_authority' => $result->authority,
                'status' => CoreBillingPayment::STATUS_PENDING,
            ])->save();

            $this->recordEvent($payment, 'redirect_issued', CoreBillingPayment::STATUS_INITIATED, CoreBillingPayment::STATUS_PENDING, [
                'provider_payment_id' => $result->providerPaymentId,
                'redirect_url' => $result->redirectUrl,
                'diagnostics' => $diag,
            ], $actor);

            return ['payment' => $payment, 'redirect_url' => $result->redirectUrl, 'is_replay' => false];
        });
    }

    /**
     * Trusted server-side verification + finalization.
     *
     * @return array{payment: CoreBillingPayment, outcome: string, is_replay: bool}
     */
    public function verifyAndFinalize(
        ?User $actor,
        CoreBillingPayment $payment,
        array $callbackQuery = [],
        array $headers = [],
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now('UTC');
        return DB::transaction(function () use ($actor, $payment, $callbackQuery, $headers, $at): array {
            $locked = CoreBillingPayment::query()->lockForUpdate()->findOrFail($payment->id);
            $order = CoreBillingOrder::query()->lockForUpdate()->findOrFail($locked->order_id);

            // Already finalized → idempotent return.
            if (in_array($locked->status, [CoreBillingPayment::STATUS_PAID, CoreBillingPayment::STATUS_FULFILLED, CoreBillingPayment::STATUS_ZERO_SETTLED, CoreBillingPayment::STATUS_FAILED], true)) {
                return ['payment' => $locked->fresh(), 'outcome' => $locked->status, 'is_replay' => true];
            }

            // Order expired/cancelled while awaiting payment → mark failed.
            if (in_array($order->status, [CoreBillingOrder::STATUS_CANCELLED, CoreBillingOrder::STATUS_REVIEW_EXPIRED], true)) {
                return $this->markAbandoned($locked, $order, 'order_expired', 'The order expired/cancelled before payment was finalized.', $at, $actor);
            }

            // Verify callback authenticity when present (browser-supplied
            // parameters alone are NOT settlement proof; server-side
            // verification below is the source of truth, but we reject
            // obviously-forged callbacks early).
            if ($callbackQuery !== [] && ! $this->gateway->verifyCallbackSignature($callbackQuery, $headers)) {
                $this->recordEvent($locked, 'callback_rejected', $locked->status, $locked->status, ['reason' => 'bad_signature'], $actor);
                throw new BillingDomainException('payment_callback_invalid', 'Callback signature/token is invalid.');
            }

            $authorityFromCallback = (string) ($callbackQuery['sandbox_authority'] ?? $callbackQuery['Authority'] ?? $callbackQuery['authority'] ?? $locked->provider_authority ?? '');
            $context = array_merge($callbackQuery, ['authority' => $authorityFromCallback]);
            $locked->forceFill([
                'verification_attempts' => (int) $locked->verification_attempts + 1,
                'last_provider_attempt_at' => $at,
            ])->save();

            $this->recordEvent($locked, 'verification_attempted', $locked->status, $locked->status, [
                'attempt' => (int) $locked->verification_attempts,
            ], $actor);

            $result = $this->gateway->verify($locked, $context);
            $diag = $this->gateway->redactDiagnostics($result->diagnostics);

            if ($result->isPending()) {
                $locked->forceFill([
                    'status' => CoreBillingPayment::STATUS_PENDING,
                    'next_reconcile_after' => $at->addMinutes(5),
                    'reconciliation_state' => 'pending',
                    'failure_code' => $result->errorCode,
                    'failure_reason' => $result->errorMessage,
                ])->save();
                $this->recordEvent($locked, 'verification_pending', $locked->status, CoreBillingPayment::STATUS_PENDING, ['diagnostics' => $diag], $actor);

                return ['payment' => $locked, 'outcome' => 'pending', 'is_replay' => false];
            }

            if (! $result->isPaid()) {
                $locked->forceFill([
                    'status' => CoreBillingPayment::STATUS_FAILED,
                    'failure_code' => $result->errorCode ?? 'payment_failed',
                    'failure_reason' => $result->errorMessage ?? 'Payment verification failed.',
                    'finalized_at' => $at,
                    'reconciliation_state' => 'resolved',
                ])->save();
                $this->recordEvent($locked, 'verified_failed', CoreBillingPayment::STATUS_PENDING, CoreBillingPayment::STATUS_FAILED, ['diagnostics' => $diag], $actor);

                return ['payment' => $locked, 'outcome' => 'failed', 'is_replay' => false];
            }

            // Authoritative paid — check invariants.
            if ($result->verifiedCurrency !== null && strtoupper($result->verifiedCurrency) !== strtoupper((string) $locked->requested_currency)) {
                return $this->mismatchFail($locked, 'currency_mismatch', 'Currency mismatch between request and verified payment.', $diag, $at, $actor);
            }
            if ($result->verifiedAmountToman !== null && (int) $result->verifiedAmountToman !== (int) $locked->requested_amount_toman) {
                return $this->mismatchFail($locked, 'amount_mismatch', 'Paid amount does not match order total.', $diag, $at, $actor);
            }

            // Atomically mark paid, transition order to paid, flip reservation
            // to redeemed exactly once, and enqueue fulfillment outbox.
            $locked->forceFill([
                'status' => CoreBillingPayment::STATUS_PAID,
                'verified_amount_toman' => (int) ($result->verifiedAmountToman ?? $locked->requested_amount_toman),
                'verified_currency' => (string) ($result->verifiedCurrency ?? $locked->requested_currency),
                'provider_transaction_id' => $result->providerTransactionId,
                'provider_trace_id' => $result->providerTraceId,
                'verified_at' => $at,
                'finalized_at' => $at,
                'failure_code' => null,
                'failure_reason' => null,
                'reconciliation_state' => 'resolved',
                'fulfillment_event_id' => 'pay:'.$locked->id.':'.Str::random(16),
            ])->save();

            $order->forceFill([
                'status' => CoreBillingOrder::STATUS_PAID,
            ])->save();

            // Promo reservation redeemed exactly once.
            CorePromoReservation::query()
                ->where('order_id', (int) $order->id)
                ->where('state', CorePromoReservation::STATE_RESERVED)
                ->update([
                    'state' => CorePromoReservation::STATE_REDEEMED,
                    'redeemed_at' => $at->toDateTimeString(),
                ]);

            $this->recordEvent($locked, 'verified_paid', CoreBillingPayment::STATUS_PENDING, CoreBillingPayment::STATUS_PAID, [
                'provider_transaction_id' => $result->providerTransactionId,
                'verified_amount_toman' => (int) $result->verifiedAmountToman,
                'diagnostics' => $diag,
            ], $actor);

            // Outbox: dispatch fulfillment.
            DB::table('core_billing_fulfillment_outbox')->insert([
                'event_id' => $locked->fulfillment_event_id,
                'event_type' => 'subscription.payment_paid',
                'payment_id' => (int) $locked->id,
                'order_id' => (int) $order->id,
                'owner_key' => $locked->owner_key,
                'payload' => json_encode([
                    'payment_id' => (int) $locked->id,
                    'order_id' => (int) $order->id,
                    'quote_id' => (int) $order->quote_id,
                    'owner_key' => $locked->owner_key,
                    'period' => $order->period,
                    'amount_toman' => (int) $order->total_toman,
                    'organization_id' => $order->organization_id,
                    'personal_workspace_id' => $order->personal_workspace_id,
                ], JSON_THROW_ON_ERROR),
                'created_at' => $at->toDateTimeString(),
                'next_dispatch_after' => $at->toDateTimeString(),
                'dispatch_attempts' => 0,
            ]);

            $this->audit->record($actor, 'billing.payment.paid', [
                'payment_id' => (int) $locked->id,
                'order_id' => (int) $order->id,
                'owner' => $locked->owner_key,
                'amount_toman' => (int) $locked->requested_amount_toman,
                'provider_transaction_id' => $result->providerTransactionId,
                'fulfillment_event_id' => $locked->fulfillment_event_id,
            ], $this->scopeTypeFor($locked), $this->scopeIdFor($locked), 'billing_payment', (int) $locked->id);

            return ['payment' => $locked, 'outcome' => 'paid', 'is_replay' => false];
        });
    }

    /**
     * Dispatch (apply) the next outbox event. Returns true if any
     * event was dispatched. Safe to call from a worker/retry loop.
     */
    public function dispatchOutbox(callable $fulfillmentHandler, ?CarbonImmutable $at = null): int
    {
        $at ??= CarbonImmutable::now('UTC');
        $dispatched = 0;
        while (true) {
            $row = DB::transaction(function () use ($at) {
                $evt = CoreBillingFulfillmentOutbox::query()
                    ->whereNull('dispatched_at')
                    ->where(function ($q) use ($at) {
                        $q->whereNull('next_dispatch_after')->orWhere('next_dispatch_after', '<=', $at);
                    })
                    ->lockForUpdate()
                    ->orderBy('id')
                    ->first();
                if ($evt === null) {
                    return null;
                }
                $evt->forceFill([
                    'dispatch_attempts' => (int) $evt->dispatch_attempts + 1,
                ])->save();

                return $evt;
            });
            if ($row === null) {
                break;
            }
            try {
                $fulfillmentHandler($row);
                DB::transaction(function () use ($row, $at): void {
                    CoreBillingFulfillmentOutbox::query()->whereKey($row->id)->update([
                        'dispatched_at' => $at->toDateTimeString(),
                        'last_error' => null,
                    ]);
                    CoreBillingPayment::query()->whereKey($row->payment_id)->update([
                        'status' => CoreBillingPayment::STATUS_FULFILLED,
                        'fulfilled_at' => $at->toDateTimeString(),
                    ]);
                });
                $dispatched++;
            } catch (Throwable $e) {
                DB::table('core_billing_fulfillment_outbox')->whereKey($row->id)->update([
                    'next_dispatch_after' => $at->addSeconds(min(60 * pow(2, min($row->dispatch_attempts, 5)), 3600))->toDateTimeString(),
                    'last_error' => substr($e->getMessage(), 0, 500),
                ]);
                // Do not rethrow; other events can still dispatch.
            }
        }

        return $dispatched;
    }

    // ---- zero-amount path ----

    private function initiateZeroPayable(
        User $actor,
        SubscriptionOwner $owner,
        CoreBillingOrder $order,
        string $idempotencyKey,
        CarbonImmutable $at,
    ): array {
        $ownerKey = CoreBillingPayment::ownerKeyFor($owner);

        return DB::transaction(function () use ($actor, $owner, $ownerKey, $order, $idempotencyKey, $at): array {
            $lockedOrder = $this->lockOrderForWrite($order);
            $this->assertOrderConvertible($lockedOrder, $at);

            if ($lockedOrder->total_toman !== 0) {
                throw new BillingDomainException('payment_zero_invalid', 'Zero-settlement requires a zero-total order.');
            }
            $lockedOrder->forceFill(['status' => CoreBillingOrder::STATUS_PAYABLE_PENDING])->save();

            $payment = CoreBillingPayment::create([
                'order_id' => (int) $lockedOrder->id,
                'owner_key' => $ownerKey,
                'organization_id' => $owner->type === 'organization' ? (int) $owner->organization->id : null,
                'personal_workspace_id' => $owner->type === 'personal' ? (int) $owner->personalWorkspace->id : null,
                'idempotency_key' => $idempotencyKey,
                'payload_hash' => hash('sha256', implode('|', ['v1', 'zero', (string) $lockedOrder->id])),
                'provider' => 'internal',
                'provider_method' => 'zero_pay',
                'requested_amount_toman' => 0,
                'requested_currency' => 'TOMAN',
                'status' => CoreBillingPayment::STATUS_ZERO_SETTLED,
                'verified_amount_toman' => 0,
                'verified_currency' => 'TOMAN',
                'provider_transaction_id' => 'ZERO-'.Str::upper(Str::random(10)),
                'initiated_at' => $at,
                'verified_at' => $at,
                'finalized_at' => $at,
                'fulfillment_event_id' => 'zero:'.$lockedOrder->id.':'.Str::random(16),
                'created_by_user_id' => $actor->id,
            ]);

            $lockedOrder->forceFill(['status' => CoreBillingOrder::STATUS_PAID])->save();

            CorePromoReservation::query()
                ->where('order_id', (int) $lockedOrder->id)
                ->where('state', CorePromoReservation::STATE_RESERVED)
                ->update([
                    'state' => CorePromoReservation::STATE_REDEEMED,
                    'redeemed_at' => $at->toDateTimeString(),
                ]);

            DB::table('core_billing_fulfillment_outbox')->insert([
                'event_id' => $payment->fulfillment_event_id,
                'event_type' => 'subscription.payment_paid',
                'payment_id' => (int) $payment->id,
                'order_id' => (int) $lockedOrder->id,
                'owner_key' => $ownerKey,
                'payload' => json_encode([
                    'payment_id' => (int) $payment->id,
                    'order_id' => (int) $lockedOrder->id,
                    'quote_id' => (int) $lockedOrder->quote_id,
                    'owner_key' => $ownerKey,
                    'period' => $lockedOrder->period,
                    'amount_toman' => 0,
                    'organization_id' => $lockedOrder->organization_id,
                    'personal_workspace_id' => $lockedOrder->personal_workspace_id,
                    'zero_payable' => true,
                ], JSON_THROW_ON_ERROR),
                'created_at' => $at->toDateTimeString(),
                'next_dispatch_after' => $at->toDateTimeString(),
                'dispatch_attempts' => 0,
            ]);

            $this->recordEvent($payment, 'zero_settled', null, CoreBillingPayment::STATUS_ZERO_SETTLED, ['amount' => 0], $actor);

            $this->audit->record($actor, 'billing.payment.zero_settled', [
                'payment_id' => (int) $payment->id,
                'order_id' => (int) $lockedOrder->id,
                'fulfillment_event_id' => $payment->fulfillment_event_id,
            ], $this->scopeTypeFor($payment), $this->scopeIdFor($payment), 'billing_payment', (int) $payment->id);

            return ['payment' => $payment, 'redirect_url' => null, 'is_replay' => false];
        });
    }

    // ---- reconciliation ----

    /**
     * Tick pending payments for re-verification (called from the
     * reconciliation command). Returns number of retries attempted.
     */
    public function reconcilePending(?CarbonImmutable $at = null): int
    {
        $at ??= CarbonImmutable::now('UTC');
        $ticked = 0;
        $pending = CoreBillingPayment::query()
            ->where('status', CoreBillingPayment::STATUS_PENDING)
            ->where(function ($q) use ($at) {
                $q->whereNull('next_reconcile_after')->orWhere('next_reconcile_after', '<=', $at);
            })
            ->limit(50)
            ->get();
        foreach ($pending as $p) {
            try {
                $this->verifyAndFinalize(null, $p, [], null, $at);
                $ticked++;
            } catch (Throwable $e) {
                DB::table('core_billing_payments')->whereKey($p->id)->update([
                    'next_reconcile_after' => $at->addMinutes(10)->toDateTimeString(),
                    'reconciliation_state' => 'pending',
                ]);
            }
        }

        return $ticked;
    }

    /** Mark payments as expired when the order is cancelled/review_expired. */
    public function markOrderPaymentsExpired(CoreBillingOrder $order, CarbonImmutable $at): void
    {
        CoreBillingPayment::query()
            ->where('order_id', $order->id)
            ->whereIn('status', [CoreBillingPayment::STATUS_INITIATED, CoreBillingPayment::STATUS_PENDING])
            ->update([
                'status' => CoreBillingPayment::STATUS_EXPIRED,
                'finalized_at' => $at->toDateTimeString(),
                'failure_code' => 'order_expired',
                'failure_reason' => 'Order expired or was cancelled before payment finalized.',
                'reconciliation_state' => 'abandoned',
            ]);
    }

    // ---- internals ----

    private function lockOrderForWrite(CoreBillingOrder $order): CoreBillingOrder
    {
        $locked = CoreBillingOrder::query()->lockForUpdate()->findOrFail($order->id);
        if ($locked->organization_id !== null) {
            DB::table('organizations')->whereKey($locked->organization_id)->lockForUpdate()->first();
        } elseif ($locked->personal_workspace_id !== null) {
            DB::table('workspaces')->whereKey($locked->personal_workspace_id)->lockForUpdate()->first();
        }

        return $locked;
    }

    private function assertOrderOwnership(CoreBillingOrder $order, string $ownerKey): void
    {
        if ($order->owner_key !== $ownerKey) {
            throw new BillingDomainException('order_owner_mismatch', 'The order belongs to a different owner.');
        }
    }

    private function assertOrderConvertible(CoreBillingOrder $order, CarbonImmutable $at): void
    {
        if ($order->status === CoreBillingOrder::STATUS_PAID) {
            return; // already paid (replay)
        }
        if (in_array($order->status, [CoreBillingOrder::STATUS_CANCELLED, CoreBillingOrder::STATUS_REVIEW_EXPIRED], true)) {
            throw new BillingDomainException('order_review_expired', 'Order is no longer payable (cancelled or expired).');
        }
        if ($order->review_expires_at !== null && $at->gte(CarbonImmutable::instance($order->review_expires_at))) {
            // Mark the order review-expired (lazy-expiry) and abort.
            $this->orders->expireReviewOrders($at);
            throw new BillingDomainException('order_review_expired', 'Order review period has expired.');
        }
        if (! in_array($order->status, [CoreBillingOrder::STATUS_IN_REVIEW, CoreBillingOrder::STATUS_PAYABLE_PENDING], true)) {
            throw new BillingDomainException('order_invalid', 'Order cannot be paid in its current state.');
        }
    }

    private function rebuildRedirectIfNeeded(CoreBillingPayment $p, ?string $returnUrl): void
    {
        if ($p->isTerminal() || $p->status === CoreBillingPayment::STATUS_PENDING) {
            return;
        }
    }

    private function redirectUrlFor(CoreBillingPayment $p): ?string
    {
        if ($p->status === CoreBillingPayment::STATUS_ZERO_SETTLED || $p->status === CoreBillingPayment::STATUS_PAID || $p->status === CoreBillingPayment::STATUS_FULFILLED || $p->status === CoreBillingPayment::STATUS_FAILED) {
            return null;
        }
        // In real adapters the redirect_url is stored on initiation; the
        // sandbox rebuilds from authority. For testing/other providers
        // we stash on diagnostics via an event; here return a generic
        // status URL (frontend) if no provider_payment_id exists.
        return null;
    }

    private function publicCallbackUrl(CoreBillingPayment $p): string
    {
        $base = rtrim((string) config('app.url', ''), '/');

        return $base.'/api/v1/billing/payments/'.$p->id.'/callback';
    }

    private function mismatchFail(CoreBillingPayment $p, string $code, string $msg, array $diag, CarbonImmutable $at, ?User $actor): array
    {
        $p->forceFill([
            'status' => CoreBillingPayment::STATUS_FAILED,
            'failure_code' => $code,
            'failure_reason' => $msg,
            'finalized_at' => $at,
            'reconciliation_state' => 'resolved',
        ])->save();
        $this->recordEvent($p, 'verified_mismatch', $p->status, CoreBillingPayment::STATUS_FAILED, [
            'code' => $code, 'diagnostics' => $diag,
        ], $actor);

        return ['payment' => $p, 'outcome' => 'failed', 'is_replay' => false];
    }

    private function markAbandoned(CoreBillingPayment $p, CoreBillingOrder $order, string $code, string $msg, CarbonImmutable $at, ?User $actor): array
    {
        $p->forceFill([
            'status' => $order->status === CoreBillingOrder::STATUS_CANCELLED
                ? CoreBillingPayment::STATUS_CANCELLED
                : CoreBillingPayment::STATUS_EXPIRED,
            'failure_code' => $code,
            'failure_reason' => $msg,
            'finalized_at' => $at,
            'reconciliation_state' => 'abandoned',
        ])->save();
        $this->recordEvent($p, 'abandoned', $p->status, $p->status, ['order_status' => $order->status], $actor);

        return ['payment' => $p, 'outcome' => $p->status, 'is_replay' => false];
    }

    private function recordEvent(CoreBillingPayment $p, string $event, ?string $from, ?string $to, array $data, ?User $actor): void
    {
        CoreBillingPaymentEvent::create([
            'payment_id' => (int) $p->id,
            'event' => $event,
            'from_status' => $from,
            'to_status' => $to,
            'data' => $data,
            'actor_user_id' => $actor?->id,
            'actor_type' => $actor !== null ? CoreBillingPaymentEvent::ACTOR_USER : CoreBillingPaymentEvent::ACTOR_SYSTEM,
            'occurred_at' => CarbonImmutable::now('UTC'),
        ]);
    }

    private function scopeTypeFor(CoreBillingPayment $p): string
    {
        return str_starts_with($p->owner_key, 'org:') ? 'organization' : 'workspace';
    }

    private function scopeIdFor(CoreBillingPayment $p): int
    {
        return (int) ($p->organization_id ?? $p->personal_workspace_id ?? 0);
    }
}
