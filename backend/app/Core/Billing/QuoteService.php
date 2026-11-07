<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Workspaces\Workspace;
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

        // Fast-path replay: if an idempotent quote already exists,
        // return it without mutating anything (no duplicate
        // reservation, no supersession).
        $existing = CoreBillingQuote::query()
            ->where('idempotency_key', $idempotencyKey)
            ->first();
        if ($existing !== null) {
            // Idempotency keys are scoped to the actor's owner in
            // addition to the unique DB constraint: a different
            // owner reusing the same key is a 422.
            if ($existing->owner_key !== $ownerKey) {
                throw new BillingDomainException(
                    'quote_idempotency_key_conflict',
                    'The idempotency key is already bound to a different owner.',
                );
            }
            $this->lazyExpireIfNeeded($existing, $at);

            return ['quote' => $existing, 'is_replay' => true];
        }

        return DB::transaction(function () use ($actor, $owner, $ownerKey, $planVersion, $period, $promoCode, $idempotencyKey, $at): array {
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

            // Promo evaluation under promo row lock (if provided).
            $promo = null;
            $discount = 0;
            $reservationIdem = 'quote:'.$idempotencyKey;
            $ownerRedeemedPlusReserved = $this->countOwnerRedemptionsAndReservations($ownerKey, $promoCode, null);
            if ($promoCode !== null && $promoCode !== '') {
                $promo = $this->promos->findByCode($promoCode);
                if ($promo === null) {
                    throw new BillingDomainException('promo_not_found', 'Promotion code is not recognized.');
                }
                $promo = CorePromotion::query()->lockForUpdate()->find($promo->id);
                $openReservations = $this->countOpenReservationsForPromo($promo->id);
                $ownerRedeemedPlusReserved = $this->countOwnerRedemptionsAndReservations($ownerKey, null, $promo->id);

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

            // Supersede any existing open quote for the same
            // (owner, plan version) — SPEC M2-R5. Release its
            // reservation in the same transaction and stamp the
            // new quote as the successor.
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
        $this->lazyExpireIfNeeded($quote);

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
        // Release any reserved promo capacity.
        foreach ($locked->reservations()->lockForUpdate()->get() as $res) {
            if ($res->state === CorePromoReservation::STATE_RESERVED) {
                $res->forceFill([
                    'state' => CorePromoReservation::STATE_EXPIRED,
                    'released_at' => $at->toDateTimeString(),
                ])->save();
            }
        }

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
            foreach ($prior->reservations()->lockForUpdate()->get() as $res) {
                if ($res->state === CorePromoReservation::STATE_RESERVED) {
                    $res->forceFill([
                        'state' => CorePromoReservation::STATE_RELEASED,
                        'released_at' => $at->toDateTimeString(),
                    ])->save();
                }
            }

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

    /**
     * After a new quote is created, stamp superseded prior rows with
     * superseded_by_quote_id pointing at the new quote. Called by
     * create() inside the same transaction after insert.
     */
    public function linkSupersededBy(int $newQuoteId, string $ownerKey, int $planVersionId, CarbonImmutable $at): void
    {
        CoreBillingQuote::query()
            ->where('owner_key', $ownerKey)
            ->where('plan_version_id', $planVersionId)
            ->where('status', CoreBillingQuote::STATUS_SUPERSEDED)
            ->whereNull('superseded_by_quote_id')
            ->where('id', '!=', $newQuoteId)
            ->update(['superseded_by_quote_id' => $newQuoteId]);
    }

    private function countOpenReservationsForPromo(int $promoId): int
    {
        return (int) CorePromoReservation::query()
            ->where('promo_id', $promoId)
            ->where('state', CorePromoReservation::STATE_RESERVED)
            ->count();
    }

    private function countOwnerRedemptionsAndReservations(string $ownerKey, ?string $unusedCode, ?int $promoId): int
    {
        if ($promoId === null) {
            return 0;
        }
        // Count reserved reservations for this owner+promo that are
        // still consuming capacity. Redeemed counts come from the
        // promo owner counter not per-owner (we don't have a
        // per-owner redemption table; per_owner_limit counts
        // reservations the owner currently holds against this
        // promo — a conservative interpretation that prevents
        // double-dipping via serial quote-reserve-and-expire abuse,
        // consistent with "counting redeemed + open valid reservations").
        //
        // Since core_promotions does not track per-owner redeemed
        // history (that would be a separate table), we count
        // currently-reserved rows for (owner, promo) only; prior
        // redemptions that completed and whose reservations are
        // 'redeemed' also count.
        return (int) CorePromoReservation::query()
            ->where('owner_key', $ownerKey)
            ->where('promo_id', $promoId)
            ->whereIn('state', [CorePromoReservation::STATE_RESERVED, CorePromoReservation::STATE_REDEEMED])
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
