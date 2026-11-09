<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * C5-M2-S4 order review lifecycle (SPEC-C5-M2 §3.4, §3.7).
 *
 * Convert a quote into an independently-expiring order-review
 * record, list/get owner-scoped orders, cancel an unpaid order,
 * and sweep expired review orders (releasing their promo
 * reservations). S4 never initiates payment; never increments
 * promo redemption counts.
 *
 * Lock order inside every mutating transaction is consistent with
 * S3: quote row → order row (if exists) → promo reservation rows.
 * This prevents deadlocks against the S3 expiry/supersession
 * sweeper, which already locks quote first.
 */
final class OrderService
{
    public function __construct(
        private readonly AuditWriter $audit,
    )
    {
    }

    /**
     * Convert a quote into an order, or return the existing order on
     * idempotent replay. Throws BillingDomainException when the quote
     * is not convertible (superseded, expired, wrong owner).
     *
     * @return array{order: CoreBillingOrder, is_replay: bool}
     */
    public function convert(
        User $actor,
        SubscriptionOwner $owner,
        CoreBillingQuote $quote,
        string $idempotencyKey,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now();
        $this->assertValidIdempotencyKey($idempotencyKey);

        $ownerKey = $this->ownerKeyFor($owner);
        $this->assertQuoteOwnership($quote, $ownerKey);

        // Fast-path replay: if an order already exists for this quote
        // return it (quote_id is unique). Also check owner+key to
        // reject key reuse against a different payload (same policy
        // as quotes).
        $existing = CoreBillingOrder::query()
            ->where('quote_id', $quote->id)
            ->first();
        if ($existing !== null) {
            $this->lazyReviewExpireIfNeeded($existing, $at);
            if ($existing->owner_key !== $ownerKey) {
                throw new BillingDomainException(
                    'order_owner_mismatch',
                    'The order belongs to a different owner.',
                );
            }

            return ['order' => $existing, 'is_replay' => true];
        }

        $payloadHash = hash('sha256', implode('|', ['v1', 'convert', (string) $quote->id]));

        // Check owner+idem collision independently of quote.
        $idemExisting = CoreBillingOrder::query()
            ->where('owner_key', $ownerKey)
            ->where('idempotency_key', $idempotencyKey)
            ->first();
        if ($idemExisting !== null && (int) $idemExisting->quote_id !== (int) $quote->id) {
            $this->assertIdempotentPayloadMatches($idemExisting, $payloadHash);

            return ['order' => $idemExisting, 'is_replay' => true];
        }

        // Re-lock quote FOR UPDATE in a short transaction so we can
        // transition terminal states (expired/superseded) before raising,
        // without rolling them back when we throw.
        $preCheck = DB::transaction(function () use ($quote, $at): array {
            $locked = CoreBillingQuote::query()
                ->lockForUpdate()
                ->findOrFail($quote->id);

            $already = CoreBillingOrder::query()->where('quote_id', $locked->id)->first();
            if ($already !== null) {
                return ['already' => $already];
            }
            if ($locked->status === CoreBillingQuote::STATUS_SUPERSEDED) {
                return ['reject' => 'quote_superseded', 'quote' => $locked];
            }
            if ($locked->status === CoreBillingQuote::STATUS_CONVERTED) {
                // Convert: race where another txn converted; caller will re-check.
                $already = CoreBillingOrder::query()->where('quote_id', $locked->id)->first();

                return ['already' => $already ?? 'quote_already_converted'];
            }
            if ($locked->status === CoreBillingQuote::STATUS_EXPIRED) {
                return ['reject' => 'quote_expired', 'quote' => $locked];
            }
            if (!$locked->isConvertibleAt($at)) {
                // Lazily expire inside the txn so the status update +
                // reservation release are atomic and durable (we will
                // commit & re-read before throwing).
                $this->expireQuoteLocked($locked, $at);

                return ['reject' => 'quote_expired', 'quote' => $locked->fresh()];
            }

            return ['ok' => $locked];
        });

        if (isset($preCheck['already'])) {
            if ($preCheck['already'] instanceof CoreBillingOrder) {
                if ($preCheck['already']->owner_key !== $ownerKey) {
                    throw new BillingDomainException('order_owner_mismatch', 'The order belongs to a different owner.');
                }

                return ['order' => $preCheck['already'], 'is_replay' => true];
            }
            throw new BillingDomainException((string) $preCheck['already'], 'This quote has already been converted.');
        }
        if (isset($preCheck['reject'])) {
            $code = $preCheck['reject'];
            $msg = match ($code) {
                'quote_expired' => 'This quote has expired and cannot be converted.',
                'quote_superseded' => 'This quote has been superseded by a newer quote and cannot be converted.',
                default => 'Quote cannot be converted.',
            };

            throw new BillingDomainException($code, $msg);
        }
        $lockedQuote = $preCheck['ok'];

        [$order, $isReplay] = DB::transaction(function () use ($actor, $owner, $ownerKey, $lockedQuote, $idempotencyKey, $payloadHash, $at): array {
            // Re-lock the quote; another concurrent txn may have raced.
            $locked = CoreBillingQuote::query()->lockForUpdate()->findOrFail($lockedQuote->id);
            $existingOrder = CoreBillingOrder::query()->where('quote_id', $locked->id)->first();
            if ($existingOrder !== null) {
                return [$existingOrder, true];
            }
            if ($locked->status !== CoreBillingQuote::STATUS_OPEN || !$locked->isConvertibleAt($at)) {
                // State changed between pre-check and inner txn: expire /
                // supersede race; bail (outer caller should retry if wanted).
                throw new BillingDomainException(
                    $locked->status === CoreBillingQuote::STATUS_EXPIRED ? 'quote_expired' : 'quote_superseded',
                    'Quote state changed; please retry.',
                );
            }

            $reviewTtlDays = (int) config('billing.provisional.order_review_ttl_days', 7);
            if ($reviewTtlDays <= 0) {
                $reviewTtlDays = 7;
            }
            $reviewExpiresAt = $at->addDays($reviewTtlDays);

            $order = CoreBillingOrder::create([
                'quote_id' => (int) $lockedQuote->id,
                'owner_key' => $ownerKey,
                'organization_id' => $owner->type === 'organization' ? (int) $owner->organization->id : null,
                'personal_workspace_id' => $owner->type === 'personal' ? (int) $owner->personalWorkspace->id : null,
                'period' => $lockedQuote->period,
                'subtotal_toman' => (int) $lockedQuote->subtotal_toman,
                'discount_toman' => (int) $lockedQuote->discount_toman,
                'tax_toman' => (int) $lockedQuote->tax_toman,
                'total_toman' => (int) $lockedQuote->total_toman,
                'promo_id' => $lockedQuote->promo_id,
                'promo_code_snapshot' => $lockedQuote->promo_code_snapshot,
                'tax_rule_id' => $lockedQuote->tax_rule_id,
                'tax_rate_basis_points' => $lockedQuote->tax_rate_basis_points,
                'status' => CoreBillingOrder::STATUS_IN_REVIEW,
                'review_expires_at' => $reviewExpiresAt->toDateTimeString(),
                'idempotency_key' => $idempotencyKey,
                'payload_hash' => $payloadHash,
                'created_by_user_id' => $actor->id,
            ]);

            // Insert immutable itemized lines.
            $now = $at->toDateTimeString();
            CoreBillingOrderLine::create([
                'order_id' => (int) $order->id,
                'kind' => CoreBillingOrderLine::KIND_PLAN,
                'description' => sprintf('Plan subscription (%s)', $lockedQuote->period),
                'amount_toman' => (int) $lockedQuote->subtotal_toman,
                'price_id' => (int) $lockedQuote->price_id,
                'created_at' => $now,
            ]);
            if ((int) $lockedQuote->discount_toman > 0) {
                CoreBillingOrderLine::create([
                    'order_id' => (int) $order->id,
                    'kind' => CoreBillingOrderLine::KIND_DISCOUNT,
                    'description' => $lockedQuote->promo_code_snapshot !== null
                        ? sprintf('Promotion %s', $lockedQuote->promo_code_snapshot)
                        : 'Discount',
                    'amount_toman' => -1 * (int) $lockedQuote->discount_toman,
                    'price_id' => null,
                    'created_at' => $now,
                ]);
            }
            if ((int) $lockedQuote->tax_toman > 0 || $lockedQuote->tax_rule_id !== null) {
                CoreBillingOrderLine::create([
                    'order_id' => (int) $order->id,
                    'kind' => CoreBillingOrderLine::KIND_TAX,
                    'description' => $lockedQuote->tax_rate_basis_points !== null
                        ? sprintf('Tax (%s bp)', (int) $lockedQuote->tax_rate_basis_points)
                        : 'Tax',
                    'amount_toman' => (int) $lockedQuote->tax_toman,
                    'price_id' => null,
                    'tax_rate_basis_points' => $lockedQuote->tax_rate_basis_points,
                    'created_at' => $now,
                ]);
            }

            // Transfer promo reservation (if any) from quote to order
            // atomically: state -> CONVERTED, order_id stamped. This
            // does NOT go through a free/reserve cycle so the slot
            // is never visible as available between quote and order.
            // Because markQuoteExpiredLocked and supersession filter
            // on state = STATE_RESERVED, they will not touch this
            // row after conversion.
            foreach ($lockedQuote->reservations()->lockForUpdate()->get() as $res) {
                if ($res->state === CorePromoReservation::STATE_RESERVED) {
                    $res->forceFill([
                        'state' => CorePromoReservation::STATE_CONVERTED,
                        'order_id' => (int) $order->id,
                    ])->save();
                }
            }

            // Mark quote CONVERTED with conversion timestamp via
            // converted_at column.
            $lockedQuote->forceFill([
                'status' => CoreBillingQuote::STATUS_CONVERTED,
                'converted_at' => $now,
            ])->save();

            $this->audit->record(
                $actor,
                'billing.order.created',
                [
                    'order_id' => (int) $order->id,
                    'quote_id' => (int) $lockedQuote->id,
                    'owner_key' => $ownerKey,
                    'total_toman' => (int) $order->total_toman,
                    'review_expires_at' => $reviewExpiresAt->toIso8601String(),
                    'is_replay' => false,
                ],
                $owner->type,
                $owner->id(),
                'core_billing_orders',
                (int) $order->id,
            );

            return [$order->fresh(), false];
        });

        return ['order' => $order->fresh(['lines', 'promo', 'taxRule', 'quote']), 'is_replay' => $isReplay];
    }

    /**
     * Fetch an order scoped to an owner; returns null for cross-owner.
     */
    public function findForOwner(int $orderId, SubscriptionOwner $owner): ?CoreBillingOrder
    {
        $ownerKey = $this->ownerKeyFor($owner);
        $order = CoreBillingOrder::query()
            ->with(['lines', 'promo', 'taxRule', 'quote'])
            ->where('id', $orderId)
            ->where('owner_key', $ownerKey)
            ->first();
        if ($order === null) {
            return null;
        }
        $this->lazyReviewExpireIfNeeded($order, CarbonImmutable::now());

        return $order->fresh(['lines', 'promo', 'taxRule', 'quote']);
    }

    /**
     * List an owner's orders (paginated, newest first).
     */
    public function listForOwner(SubscriptionOwner $owner, int $perPage = 20): LengthAwarePaginator
    {
        $ownerKey = $this->ownerKeyFor($owner);
        $this->expireOrdersForOwner($ownerKey, CarbonImmutable::now());

        return CoreBillingOrder::query()
            ->with(['lines', 'promo', 'quote'])
            ->where('owner_key', $ownerKey)
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    /**
     * Cancel an in-review order. Releases the attached promo
     * reservation (if any) atomically. Idempotent: cancelling an
     * already-cancelled order is a no-op. Cancelling an expired
     * order is an error.
     */
    public function cancel(User $actor, SubscriptionOwner $owner, int $orderId): CoreBillingOrder
    {
        $ownerKey = $this->ownerKeyFor($owner);
        $at = CarbonImmutable::now();

        return DB::transaction(function () use ($actor, $owner, $ownerKey, $orderId, $at): CoreBillingOrder {
            $order = CoreBillingOrder::query()
                ->lockForUpdate()
                ->where('id', $orderId)
                ->where('owner_key', $ownerKey)
                ->first();
            if ($order === null) {
                throw new BillingDomainException('order_not_found', 'Order not found.');
            }
            if ($order->status === CoreBillingOrder::STATUS_CANCELLED) {
                return $order;
            }
            if ($order->status === CoreBillingOrder::STATUS_REVIEW_EXPIRED) {
                throw new BillingDomainException('order_review_expired', 'This order has already expired and cannot be cancelled.');
            }
            if (in_array($order->status, [CoreBillingOrder::STATUS_PAYABLE_PENDING, CoreBillingOrder::STATUS_PAID], true)) {
                throw new BillingDomainException('order_payment_in_progress', 'Payment has been initiated; cannot cancel during processing.');
            }
            if (!$order->isCancellableAt($at)) {
                // Expire defensively then throw.
                $this->expireOrderLocked($order, $at);

                throw new BillingDomainException('order_review_expired', 'This order has expired and cannot be cancelled.');
            }

            $order->forceFill([
                'status' => CoreBillingOrder::STATUS_CANCELLED,
                'cancelled_at' => $at->toDateTimeString(),
                'cancelled_by_user_id' => $actor->id,
            ])->save();

            $this->releaseOrderReservationsLocked($order, $at, CorePromoReservation::STATE_RELEASED);

            $this->audit->record(
                $actor,
                'billing.order.cancelled',
                ['order_id' => (int) $order->id, 'owner_key' => $ownerKey],
                $owner->type,
                $owner->id(),
                'core_billing_orders',
                (int) $order->id,
            );

            return $order->fresh();
        });
    }

    /**
     * Sweeper: expire in_review orders past review_expires_at,
     * releasing their promo reservations. Returns number of expired
     * orders.
     */
    public function expireReviewOrders(?CarbonImmutable $at = null): int
    {
        $at ??= CarbonImmutable::now();
        $expired = 0;
        CoreBillingOrder::query()
            ->where('status', CoreBillingOrder::STATUS_IN_REVIEW)
            ->where('review_expires_at', '<=', $at->toDateTimeString())
            ->orderBy('id')
            ->chunkById(100, function ($orders) use ($at, &$expired): void {
                foreach ($orders as $order) {
                    DB::transaction(function () use ($order, $at): void {
                        $locked = CoreBillingOrder::query()->lockForUpdate()->find($order->id);
                        if ($locked === null || $locked->status !== CoreBillingOrder::STATUS_IN_REVIEW) {
                            return;
                        }
                        if ($locked->review_expires_at > $at) {
                            return;
                        }
                        $this->expireOrderLocked($locked, $at);
                    });
                    $expired++;
                }
            });

        return $expired;
    }

    // ---------- internal ----------

    private function ownerKeyFor(SubscriptionOwner $owner): string
    {
        return $owner->type === 'organization'
            ? CoreBillingOrder::ownerKeyForOrganization((int) $owner->organization->id)
            : CoreBillingOrder::ownerKeyForPersonalWorkspace((int) $owner->personalWorkspace->id);
    }

    private function assertQuoteOwnership(CoreBillingQuote $quote, string $ownerKey): void
    {
        if ($quote->owner_key !== $ownerKey) {
            throw new BillingDomainException('quote_owner_mismatch', 'Quote does not belong to this owner.');
        }
    }

    private function expireOrdersForOwner(string $ownerKey, CarbonImmutable $at): void
    {
        CoreBillingOrder::query()
            ->where('owner_key', $ownerKey)
            ->where('status', CoreBillingOrder::STATUS_IN_REVIEW)
            ->where('review_expires_at', '<=', $at->toDateTimeString())
            ->orderBy('id')
            ->chunkById(100, function ($orders) use ($at): void {
                foreach ($orders as $order) {
                    DB::transaction(function () use ($order, $at): void {
                        $locked = CoreBillingOrder::query()->lockForUpdate()->find($order->id);
                        if ($locked === null || $locked->status !== CoreBillingOrder::STATUS_IN_REVIEW) {
                            return;
                        }
                        $this->expireOrderLocked($locked, $at);
                    });
                }
            });
    }

    private function lazyReviewExpireIfNeeded(CoreBillingOrder $order, CarbonImmutable $at): void
    {
        if ($order->status === CoreBillingOrder::STATUS_IN_REVIEW && $order->isReviewExpiredAt($at)) {
            DB::transaction(function () use ($order, $at): void {
                $locked = CoreBillingOrder::query()->lockForUpdate()->find($order->id);
                if ($locked !== null && $locked->status === CoreBillingOrder::STATUS_IN_REVIEW && $locked->isReviewExpiredAt($at)) {
                    $this->expireOrderLocked($locked, $at);
                }
            });
        }
    }

    private function expireOrderLocked(CoreBillingOrder $locked, CarbonImmutable $at): void
    {
        $locked->forceFill([
            'status' => CoreBillingOrder::STATUS_REVIEW_EXPIRED,
            'expired_at' => $at->toDateTimeString(),
        ])->save();
        $this->releaseOrderReservationsLocked($locked, $at, CorePromoReservation::STATE_EXPIRED);

        $ownerType = str_starts_with($locked->owner_key, 'org:') ? 'organization' : 'workspace';
        $this->audit->record(
            null,
            'billing.order.review_expired',
            ['order_id' => (int) $locked->id, 'owner_key' => $locked->owner_key],
            $ownerType,
            $locked->organization_id ?? $locked->personal_workspace_id,
            'core_billing_orders',
            (int) $locked->id,
        );
    }

    /**
     * Release all CONVERTED reservations attached to an order
     * (cancellation → STATE_RELEASED; review-expiry → STATE_EXPIRED).
     * Guarded by state = STATE_CONVERTED to make double-release a
     * no-op, matching the S3 quote-expiry double-release guard.
     */
    private function releaseOrderReservationsLocked(CoreBillingOrder $order, CarbonImmutable $at, string $terminalState): void
    {
        CorePromoReservation::query()
            ->where('order_id', (int) $order->id)
            ->where('state', CorePromoReservation::STATE_CONVERTED)
            ->update([
                'state' => $terminalState,
                'released_at' => $at->toDateTimeString(),
            ]);
    }

    /**
     * Expire a quote during conversion (last-mile expiry race).
     * Mirrors QuoteService::markQuoteExpiredLocked — but we do it
     * here instead of reaching into QuoteService private state.
     */
    private function expireQuoteLocked(CoreBillingQuote $locked, CarbonImmutable $at): void
    {
        if ($locked->status !== CoreBillingQuote::STATUS_OPEN) {
            return;
        }
        $locked->forceFill(['status' => CoreBillingQuote::STATUS_EXPIRED])->save();
        CorePromoReservation::query()
            ->where('quote_id', (int) $locked->id)
            ->where('state', CorePromoReservation::STATE_RESERVED)
            ->update([
                'state' => CorePromoReservation::STATE_EXPIRED,
                'released_at' => $at->toDateTimeString(),
            ]);
    }

    private function assertValidIdempotencyKey(string $key): void
    {
        if ($key === '' || strlen($key) > 80) {
            throw new BillingDomainException('order_idempotency_key_invalid', 'Idempotency key must be 1–80 characters.');
        }
        if (!preg_match('/^[A-Za-z0-9._:\-]+$/', $key)) {
            throw new BillingDomainException('order_idempotency_key_invalid', 'Idempotency key contains invalid characters.');
        }
    }

    private function assertIdempotentPayloadMatches(CoreBillingOrder $existing, string $payloadHash): void
    {
        if ($existing->payload_hash === null) {
            return;
        }
        if (!hash_equals((string) $existing->payload_hash, $payloadHash)) {
            throw new BillingDomainException(
                'order_idempotency_payload_mismatch',
                'The idempotency key was already used with a different order.',
            );
        }
    }
}
