<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * C5-M2-S3 quote engine (SPEC-C5-M2 §3.4, §3.7).
 *
 * Create (price-locked, immutable), read, supersede and
 * (lazy+sweeper) expire quotes. Each quote is a fixed monetary
 * snapshot — subtotal/discount/tax/total are computed once at
 * creation time and never recomputed. Promo capacity reservation
 * is atomic with quote creation; supersession and expiry release
 * the prior reservation in the same transaction.
 *
 * Quote -> order CONVERSION is intentionally out of scope for S3
 * (reserved for S4). Only statuses OPEN/EXPIRED/SUPERSEDED/CONVERTED
 * exist; markConverted() exists as a forward-compatible hook for
 * S4 but no endpoint calls it yet.
 */
final class QuoteService
{
    public function __construct(
        private readonly TaxRuleService $tax,
        private readonly PromotionService $promos,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * Create (or idempotently replay) a quote.
     *
     * @param  SubscriptionOwner  $owner  resolved owner (org or personal).
     * @param  CorePlanVersion  $planVersion  resolved active plan version whose plan audience matches the owner type.
     * @param  string  $period  CorePlanPrice::PERIOD_*.
     * @param  string|null  $promoCode  normalized/raw code or null.
     * @param  string  $idempotencyKey  client-supplied ASCII key (must be unique per request).
     * @return array{quote: CoreBillingQuote, is_replay: bool}
     */
    public function create(
        User $actor,
        SubscriptionOwner $owner,
        CorePlanVersion $planVersion,
        string $period,
        ?string $promoCode,
        string $idempotencyKey,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now();
        $this->assertValidPeriod($period);
        $this->assertIdempotencyKey($idempotencyKey);

        $ownerKey = $owner->type === 'organization'
            ? CoreBillingQuote::ownerKeyForOrganization((int) $owner->organization->id)
            : CoreBillingQuote::ownerKeyForPersonalWorkspace((int) $owner->personalWorkspace->id);

        // Normalize promo code (uppercase + trim) for lookup,
        // snapshot and payload fingerprinting.
        $normalizedPromo = ($promoCode !== null && $promoCode !== '') ? strtoupper(trim($promoCode)) : null;

        $payloadHash = self::hashPayload((int) $planVersion->id, $period, $normalizedPromo);

        // Fast-path replay: idempotency keys are unique per (owner, key).
        // A different owner reusing the same key simply creates a new
        // quote (composite unique prevents collision).
        $existing = CoreBillingQuote::query()
            ->where('owner_key', $ownerKey)
            ->where('idempotency_key', $idempotencyKey)
            ->first();
        if ($existing !== null) {
            $this->assertIdempotentPayloadMatches($existing, $payloadHash);
            $this->lazyExpireIfNeeded($existing, $at);

            return ['quote' => $existing, 'is_replay' => true];
        }

        return DB::transaction(function () use ($actor, $owner, $ownerKey, $planVersion, $period, $normalizedPromo, $idempotencyKey, $payloadHash, $at): array {
            // Lock plan version row to serialize publications with
            // quote creation (consistent lock order: version then
            // promo row).
            $lockedVersion = CorePlanVersion::query()
                ->lockForUpdate()
                ->findOrFail($planVersion->id);
            if ($lockedVersion->plan === null) {
                $lockedVersion->load('plan');
            }
            $plan = $lockedVersion->plan;
            if ($plan === null || $plan->status !== CorePlan::STATUS_ACTIVE) {
                throw new BillingDomainException('plan_inactive', 'The requested plan is not currently available.');
            }
            $this->assertPlanAudienceMatchesOwner($plan, $owner);

            // Resolve published price via canonical pointer (SPEC §3.2).
            $price = $this->resolvePublishedPriceForPeriod($lockedVersion, $period);

            // Subtotal is the locked price.
            $subtotal = (int) $price->amount_toman;
            $this->assertAmountWithinBounds($subtotal);

            // Find the prior open quote (if any) for (owner, version)
            // so we count capacity without its reservation — it will
            // be superseded (and its reservation released) atomically
            // after we insert the new quote.
            $priorOpen = CoreBillingQuote::query()
                ->where('owner_key', $ownerKey)
                ->where('plan_version_id', $lockedVersion->id)
                ->where('status', CoreBillingQuote::STATUS_OPEN)
                ->lockForUpdate()
                ->first();
            $priorReservationId = null;
            if ($priorOpen !== null) {
                $priorReservationId = (int) ($priorOpen->reservations()
                    ->where('state', CorePromoReservation::STATE_RESERVED)
                    ->value('id') ?? 0);
                if ($priorReservationId === 0) {
                    $priorReservationId = null;
                }
            }

            // Promo evaluation under promo row lock (if provided).
            $promo = null;
            $discount = 0;
            $reservationIdem = 'quote:'.$idempotencyKey;
            $ownerRedeemedPlusReserved = $this->countOwnerRedemptionsAndReservations($ownerKey, $normalizedPromo, null, $priorReservationId);
            if ($normalizedPromo !== null) {
                $promo = $this->promos->findByCode($normalizedPromo);
                if ($promo === null) {
                    throw new BillingDomainException('promo_not_found', 'Promotion code is not recognized.');
                }
                $promo = CorePromotion::query()->lockForUpdate()->find($promo->id);
                // Count open reservations globally. The prior open
                // quote for this (owner, version) is about to be
                // superseded and its reservation released in the
                // same transaction, so exclude it: the slot is
                // atomically transferred to the new quote. This is
                // safe because supersession only ever targets
                // quotes of the SAME owner-key.
                $openReservations = $this->countOpenReservationsForPromo($promo->id, $priorReservationId);
                // Per-owner limit: same reasoning — exclude the
                // reservation we are about to release.
                $ownerRedeemedPlusReserved = $this->countOwnerRedemptionsAndReservations($ownerKey, null, $promo->id, $priorReservationId);

                $result = $this->promos->evaluate($promo->code, $subtotal, $openReservations, $ownerRedeemedPlusReserved, $at);
                $discount = (int) $result['discount_toman'];
            }

            $taxable = $subtotal - $discount;
            $taxResult = $this->tax->calculateTax($taxable, $at);
            $taxAmount = (int) $taxResult['amount_toman'];
            $taxRule = $taxResult['rule_id'];
            $taxRateBp = $taxResult['rate_basis_points'];
            $total = $taxable + $taxAmount;

            if ($total < 0) {
                throw new BillingArithmeticException('money_negative', 'Computed total is negative.');
            }

            $ttlMinutes = (int) config('billing.quote.ttl_minutes', 30);
            if ($ttlMinutes <= 0) {
                $ttlMinutes = 30;
            }
            $expiresAt = $at->addMinutes($ttlMinutes);

            $quote = CoreBillingQuote::create([
                'owner_key' => $ownerKey,
                'organization_id' => $owner->type === 'organization' ? (int) $owner->organization->id : null,
                'personal_workspace_id' => $owner->type === 'personal' ? (int) $owner->personalWorkspace->id : null,
                'plan_version_id' => (int) $lockedVersion->id,
                'price_id' => (int) $price->id,
                'period' => $period,
                'subtotal_toman' => $subtotal,
                'discount_toman' => $discount,
                'tax_toman' => $taxAmount,
                'total_toman' => $total,
                'promo_id' => $promo?->id,
                'promo_code_snapshot' => $promo?->code,
                'tax_rule_id' => $taxRule,
                'tax_rate_basis_points' => $taxRateBp,
                'status' => CoreBillingQuote::STATUS_OPEN,
                'expires_at' => $expiresAt->toDateTimeString(),
                'idempotency_key' => $idempotencyKey,
                'payload_hash' => $payloadHash,
                'created_by_user_id' => $actor->id,
            ]);

            if ($promo !== null) {
                CorePromoReservation::create([
                    'quote_id' => (int) $quote->id,
                    'promo_id' => (int) $promo->id,
                    'owner_key' => $ownerKey,
                    'state' => CorePromoReservation::STATE_RESERVED,
                    'idempotency_key' => $reservationIdem,
                ]);
            }

            // Supersede any remaining open quote for the same
            // (owner, plan version) — release its reservation in
            // the same transaction and stamp the new quote as
            // successor.
            $this->supersedeOpenQuotesForOwnerVersion($ownerKey, $lockedVersion->id, (int) $quote->id, $at);

            $this->audit->record(
                $actor,
                'billing.quote.created',
                [
                    'quote_id' => (int) $quote->id,
                    'owner_key' => $ownerKey,
                    'plan_version_id' => (int) $lockedVersion->id,
                    'period' => $period,
                    'total_toman' => $total,
                    'promo_id' => $promo?->id,
                    'is_replay' => false,
                ],
                $owner->type,
                $owner->id(),
                'core_billing_quotes',
                (int) $quote->id,
            );

            return ['quote' => $quote->fresh(), 'is_replay' => false];
        });
    }

    /**
     * Fetch a quote scoped to an owner; returns null for cross-owner.
     */
    public function findForOwner(int $quoteId, SubscriptionOwner $owner): ?CoreBillingQuote
    {
        $ownerKey = $owner->type === 'organization'
            ? CoreBillingQuote::ownerKeyForOrganization((int) $owner->organization->id)
            : CoreBillingQuote::ownerKeyForPersonalWorkspace((int) $owner->personalWorkspace->id);

        $quote = CoreBillingQuote::query()
            ->with(['price', 'planVersion.plan', 'promo', 'taxRule'])
            ->where('id', $quoteId)
            ->where('owner_key', $ownerKey)
            ->first();

        if ($quote === null) {
            return null;
        }
        $this->lazyExpireIfNeeded($quote, CarbonImmutable::now());

        return $quote->fresh(['price', 'planVersion.plan', 'promo', 'taxRule']);
    }

    /**
     * List an owner's quotes (paginated), newest first. Applies
     * lazy expiry to open rows it encounters so the response is
     * consistent at the time of the call.
     */
    public function listForOwner(SubscriptionOwner $owner, int $perPage = 20): LengthAwarePaginator
    {
        $ownerKey = $owner->type === 'organization'
            ? CoreBillingQuote::ownerKeyForOrganization((int) $owner->organization->id)
            : CoreBillingQuote::ownerKeyForPersonalWorkspace((int) $owner->personalWorkspace->id);

        // First, sweep any now-expired open quotes for this owner
        // so the listing doesn't show stale OPEN rows.
        $this->expireOpenQuotesForOwner($ownerKey, CarbonImmutable::now());

        return CoreBillingQuote::query()
            ->with(['price', 'planVersion.plan', 'promo'])
            ->where('owner_key', $ownerKey)
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    /**
     * Sweeper: expire open quotes whose expires_at is now past,
     * releasing any reserved promo capacity.
     *
     * @return int Number of quotes expired by this sweep.
     */
    public function expireOpenQuotes(?CarbonImmutable $at = null): int
    {
        $at ??= CarbonImmutable::now();
        $expired = 0;

        CoreBillingQuote::query()
            ->where('status', CoreBillingQuote::STATUS_OPEN)
            ->where('expires_at', '<=', $at->toDateTimeString())
            ->orderBy('id')
            ->chunkById(100, function ($quotes) use ($at, &$expired): void {
                foreach ($quotes as $quote) {
                    DB::transaction(function () use ($quote, $at): void {
                        $locked = CoreBillingQuote::query()
                            ->lockForUpdate()
                            ->find($quote->id);
                        if ($locked === null || $locked->status !== CoreBillingQuote::STATUS_OPEN) {
                            return;
                        }
                        if ($locked->expires_at > $at) {
                            return;
                        }
                        $this->markQuoteExpiredLocked($locked, $at);
                    });
                    $expired++;
                }
            });

        return $expired;
    }

    // ------- internal helpers -------

    private function expireOpenQuotesForOwner(string $ownerKey, CarbonImmutable $at): void
    {
        CoreBillingQuote::query()
            ->where('owner_key', $ownerKey)
            ->where('status', CoreBillingQuote::STATUS_OPEN)
            ->where('expires_at', '<=', $at->toDateTimeString())
            ->orderBy('id')
            ->chunkById(100, function ($quotes) use ($at): void {
                foreach ($quotes as $quote) {
                    DB::transaction(function () use ($quote, $at): void {
                        $locked = CoreBillingQuote::query()->lockForUpdate()->find($quote->id);
                        if ($locked === null || $locked->status !== CoreBillingQuote::STATUS_OPEN) {
                            return;
                        }
                        $this->markQuoteExpiredLocked($locked, $at);
                    });
                }
            });
    }

    private function lazyExpireIfNeeded(CoreBillingQuote $quote, CarbonImmutable $at): void
    {
        if ($quote->status === CoreBillingQuote::STATUS_OPEN && $quote->isExpiredAt($at)) {
            DB::transaction(function () use ($quote, $at): void {
                $locked = CoreBillingQuote::query()->lockForUpdate()->find($quote->id);
                if ($locked !== null && $locked->status === CoreBillingQuote::STATUS_OPEN && $locked->isExpiredAt($at)) {
                    $this->markQuoteExpiredLocked($locked, $at);
                }
            });
        }
    }

    private function markQuoteExpiredLocked(CoreBillingQuote $locked, CarbonImmutable $at): void
    {
        $locked->forceFill(['status' => CoreBillingQuote::STATUS_EXPIRED])->save();
        // Atomically release any RESERVED promo capacity for this
        // quote. Single UPDATE with a state guard prevents double-
        // release under concurrent sweeper + lazy expiry races.
        CorePromoReservation::query()
            ->where('quote_id', (int) $locked->id)
            ->where('state', CorePromoReservation::STATE_RESERVED)
            ->update([
                'state' => CorePromoReservation::STATE_EXPIRED,
                'released_at' => $at->toDateTimeString(),
            ]);

        $this->audit->record(
            null,
            'billing.quote.expired',
            ['quote_id' => (int) $locked->id, 'owner_key' => $locked->owner_key],
            str_starts_with($locked->owner_key, 'org:') ? 'organization' : 'workspace',
            $locked->organization_id ?? $locked->personal_workspace_id,
            'core_billing_quotes',
            (int) $locked->id,
        );
    }

    private function supersedeOpenQuotesForOwnerVersion(string $ownerKey, int $planVersionId, ?int $excludeQuoteId, CarbonImmutable $at): void
    {
        $toSupersede = CoreBillingQuote::query()
            ->where('owner_key', $ownerKey)
            ->where('plan_version_id', $planVersionId)
            ->where('status', CoreBillingQuote::STATUS_OPEN)
            ->when($excludeQuoteId !== null, fn ($q) => $q->where('id', '!=', $excludeQuoteId))
            ->lockForUpdate()
            ->get();

        foreach ($toSupersede as $prior) {
            $prior->forceFill([
                'status' => CoreBillingQuote::STATUS_SUPERSEDED,
                'superseded_by_quote_id' => $excludeQuoteId,
            ])->save();
            // Atomic release: single UPDATE with state guard
            // prevents double-release races.
            CorePromoReservation::query()
                ->where('quote_id', (int) $prior->id)
                ->where('state', CorePromoReservation::STATE_RESERVED)
                ->update([
                    'state' => CorePromoReservation::STATE_RELEASED,
                    'released_at' => $at->toDateTimeString(),
                ]);

            $this->audit->record(
                null,
                'billing.quote.superseded',
                ['quote_id' => (int) $prior->id, 'owner_key' => $ownerKey, 'plan_version_id' => $planVersionId],
                str_starts_with($ownerKey, 'org:') ? 'organization' : 'workspace',
                $prior->organization_id ?? $prior->personal_workspace_id,
                'core_billing_quotes',
                (int) $prior->id,
            );
        }
    }

    private function countOpenReservationsForPromo(int $promoId, ?int $excludeReservationId = null): int
    {
        return (int) CorePromoReservation::query()
            ->where('promo_id', $promoId)
            ->where('state', CorePromoReservation::STATE_RESERVED)
            ->when($excludeReservationId !== null, fn ($q) => $q->where('id', '!=', $excludeReservationId))
            ->count();
    }

    private function countOwnerRedemptionsAndReservations(string $ownerKey, ?string $unusedCode, ?int $promoId, ?int $excludeReservationId = null): int
    {
        if ($promoId === null) {
            return 0;
        }

        return (int) CorePromoReservation::query()
            ->where('owner_key', $ownerKey)
            ->where('promo_id', $promoId)
            ->whereIn('state', [CorePromoReservation::STATE_RESERVED, CorePromoReservation::STATE_REDEEMED])
            ->when($excludeReservationId !== null, fn ($q) => $q->where('id', '!=', $excludeReservationId))
            ->count();
    }

    private function resolvePublishedPriceForPeriod(CorePlanVersion $version, string $period): CorePlanPrice
    {
        $relation = match ($period) {
            CorePlanPrice::PERIOD_MONTHLY => 'publishedMonthlyPrice',
            CorePlanPrice::PERIOD_QUARTERLY => 'publishedQuarterlyPrice',
            CorePlanPrice::PERIOD_ANNUAL => 'publishedAnnualPrice',
            default => throw new BillingDomainException('price_unavailable', 'Unrecognized billing period.'),
        };

        $price = $version->$relation;
        if ($price === null) {
            throw new BillingDomainException(
                'price_unavailable',
                'The requested plan and billing period is not currently available for purchase.',
            );
        }
        if (! $price->is_published) {
            // Defensive: pointer should only point at published rows.
            throw new BillingDomainException('price_unavailable', 'The requested price is not published.');
        }

        return $price;
    }

    private function assertValidPeriod(string $period): void
    {
        if (! in_array($period, CorePlanPrice::PERIODS, true)) {
            throw new BillingDomainException('period_invalid', 'Billing period must be monthly, quarterly or annual.');
        }
    }

    private function assertIdempotencyKey(string $key): void
    {
        if ($key === '' || strlen($key) > 80) {
            throw new BillingDomainException('quote_idempotency_key_invalid', 'Idempotency key must be 1–80 characters.');
        }
        if (! preg_match('/^[A-Za-z0-9._:\-]+$/', $key)) {
            throw new BillingDomainException('quote_idempotency_key_invalid', 'Idempotency key contains invalid characters.');
        }
    }

    /**
     * Canonical payload fingerprint: only inputs that materially affect
     * the resulting price/promo/tax/total are part of the hash. TTL
     * and actor metadata are not (actor is bound through owner_key).
     */
    private static function hashPayload(int $planVersionId, string $period, ?string $normalizedPromo): string
    {
        return hash('sha256', implode('|', [
            'v1',
            (string) $planVersionId,
            $period,
            $normalizedPromo ?? '',
        ]));
    }

    /**
     * Guard: a reused idempotency key with a different request payload
     * is a client bug, not a silent replay. Rows created before the
     * payload_hash column existed (hash NULL) are treated as
     * "hash unknown" and matched on owner+key only, preserving forward
     * compatibility for in-flight replays at deploy time.
     */
    private function assertIdempotentPayloadMatches(CoreBillingQuote $existing, string $payloadHash): void
    {
        if ($existing->payload_hash === null) {
            return;
        }
        if (! hash_equals((string) $existing->payload_hash, $payloadHash)) {
            throw new BillingDomainException(
                'quote_idempotency_payload_mismatch',
                'The idempotency key was already used with a different request payload.',
            );
        }
    }

    private function assertPlanAudienceMatchesOwner(CorePlan $plan, SubscriptionOwner $owner): void
    {
        $expectedAudience = $owner->type === 'organization'
            ? CorePlan::AUDIENCE_ORGANIZATION
            : CorePlan::AUDIENCE_PERSONAL;
        if ($plan->audience !== $expectedAudience) {
            throw new BillingDomainException(
                'plan_audience_mismatch',
                'The requested plan is not available for the selected ownership type.',
            );
        }
    }

    private function assertAmountWithinBounds(int $amount): void
    {
        $cap = (int) config('billing.max_amount_toman', 9_000_000_000_000_000);
        if ($amount < 0 || $amount > $cap) {
            throw new BillingArithmeticException('amount_out_of_bounds', 'Amount exceeds allowed bounds.');
        }
    }
}
