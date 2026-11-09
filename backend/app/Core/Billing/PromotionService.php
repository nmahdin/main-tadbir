<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * C5-M2-S2 promotion-code administration and evaluation (Q2=A, M2-D4=A).
 *
 * One promo per quote (enforced by callers / controller validation);
 * no stacking. This service deliberately does NOT create or persist
 * reservations — S3 quote creation does that inside its transaction
 * using checkCapacity()/reserve() once the quote table exists. S2
 * provides evaluation (Evaluate returns discount amount and the
 * promotion) plus administrative CRUD and a capacity-check helper.
 *
 * Redemption (redeem()) is called by the future payment milestone
 * (M3) in its payment transaction; S2 never marks a promo redeemed.
 */
final class PromotionService
{
    public function __construct(private readonly AuditWriter $audit) {}

    /**
     * Create a promotion code. Code is normalized (trim + uppercase).
     * Either percent (bp) or fixed (Toman) must be provided, not both.
     */
    public function create(
        string $code,
        string $label,
        string $discountType,
        ?int $discountValueBp,
        ?int $discountValueToman,
        User $actor,
        ?CarbonImmutable $startsAt = null,
        ?CarbonImmutable $endsAt = null,
        ?int $maxRedemptions = null,
        ?int $perOwnerLimit = null,
    ): CorePromotion {
        $normalized = CorePromotion::normalizeCode($code);
        $this->assertValidCode($normalized);
        $this->assertValidDiscount($discountType, $discountValueBp, $discountValueToman);
        $this->assertValidWindow($startsAt, $endsAt);
        $this->assertValidLimits($maxRedemptions, $perOwnerLimit);

        return DB::transaction(function () use ($normalized, $label, $discountType, $discountValueBp, $discountValueToman, $actor, $startsAt, $endsAt, $maxRedemptions, $perOwnerLimit): CorePromotion {
            $existing = CorePromotion::query()
                ->where('code', $normalized)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                throw new BillingDomainException(
                    'promo_code_exists',
                    "Promotion code [{$normalized}] already exists.",
                );
            }

            $promo = CorePromotion::create([
                'code' => $normalized,
                'label' => $label,
                'discount_type' => $discountType,
                'discount_value_bp' => $discountValueBp,
                'discount_value_toman' => $discountValueToman,
                'is_active' => true,
                'starts_at' => $startsAt?->toDateTimeString(),
                'ends_at' => $endsAt?->toDateTimeString(),
                'max_redemptions' => $maxRedemptions,
                'per_owner_limit' => $perOwnerLimit,
                'redeemed_count' => 0,
                'created_by' => $actor->id,
            ]);

            $this->audit->record(
                $actor,
                'billing.promo.created',
                ['promo_id' => (int) $promo->id, 'code' => $normalized, 'discount_type' => $discountType],
                'platform',
                null,
                'core_promotions',
                (int) $promo->id,
            );

            return $promo;
        });
    }

    /**
     * Look up a promo by normalized code; returns null when not found
     * or inactive. Does NOT check capacity or owner limits — use
     * evaluate() for that.
     */
    public function findByCode(string $code): ?CorePromotion
    {
        $normalized = CorePromotion::normalizeCode($code);

        return CorePromotion::query()->where('code', $normalized)->first();
    }

    /**
     * Evaluate a promo for a given subtotal. Returns the matched
     * promotion and the discount amount (Toman). Throws if the code
     * is unknown, expired, at capacity, or otherwise inapplicable.
     *
     * Capacity check uses open reservations from $openReservationsCount
     * supplied by the S3 quote transaction (so atomicity is the
     * caller's responsibility). In S2 tests pass 0 since no
     * reservations exist yet.
     */
    public function evaluate(
        string $code,
        int $subtotalToman,
        int $openReservationsCount = 0,
        int $ownerPriorRedemptions = 0,
        ?CarbonImmutable $at = null,
    ): array {
        $at ??= CarbonImmutable::now();
        $promo = $this->findByCode($code);
        if ($promo === null) {
            throw new BillingDomainException('promo_not_found', 'Promotion code is not recognized.');
        }
        if (! $promo->isValidAt($at)) {
            throw new BillingDomainException('promo_inactive', 'Promotion code is not active or has expired.');
        }
        if ($promo->max_redemptions !== null
            && ($promo->redeemed_count + $openReservationsCount) >= $promo->max_redemptions) {
            throw new BillingDomainException('promo_capacity_exceeded', 'Promotion code has reached its redemption limit.');
        }
        if ($promo->per_owner_limit !== null && $ownerPriorRedemptions >= $promo->per_owner_limit) {
            throw new BillingDomainException('promo_owner_limit', 'Promotion code has reached its per-owner redemption limit.');
        }

        return [
            'promotion' => $promo,
            'discount_toman' => $promo->computeDiscount($subtotalToman),
        ];
    }

    public function deactivate(CorePromotion $promo, User $actor): CorePromotion
    {
        return DB::transaction(function () use ($promo, $actor): CorePromotion {
            $locked = CorePromotion::query()->lockForUpdate()->findOrFail($promo->id);
            if (! $locked->is_active) {
                return $locked;
            }
            $locked->forceFill([
                'is_active' => false,
                'deactivated_by' => $actor->id,
                'deactivated_at' => now(),
            ])->save();

            $this->audit->record(
                $actor,
                'billing.promo.deactivated',
                ['promo_id' => (int) $locked->id, 'code' => $locked->code],
                'platform',
                null,
                'core_promotions',
                (int) $locked->id,
            );

            return $locked;
        });
    }

    /**
     * Increment redeemed_count. Called by M3 payment transaction on
     * successful payment (S2 only defines the method for forward
     * compatibility; no S2 caller uses it).
     */
    public function redeem(CorePromotion $promotion): void
    {
        DB::transaction(function () use ($promotion): void {
            $locked = CorePromotion::query()->lockForUpdate()->findOrFail($promotion->id);
            $locked->forceFill(['redeemed_count' => (int) $locked->redeemed_count + 1])->save();
        });
    }

    private function assertValidCode(string $code): void
    {
        if ($code === '' || strlen($code) > 32) {
            throw new BillingDomainException('promo_code_invalid', 'Promotion code must be 1–32 characters.');
        }
        if (! preg_match('/^[A-Z0-9_\-]+$/', $code)) {
            throw new BillingDomainException('promo_code_invalid', 'Promotion code may only contain A-Z, 0-9, hyphen and underscore.');
        }
    }

    private function assertValidDiscount(string $type, ?int $bp, ?int $fixed): void
    {
        if ($type === CorePromotion::TYPE_PERCENT) {
            if ($bp === null || $fixed !== null) {
                throw new BillingDomainException('promo_discount_invalid', 'Percent promotions require discount_value_bp and no fixed value.');
            }
            if ($bp < 0 || $bp > 10_000) {
                throw new BillingArithmeticException('rate_out_of_range', 'Percent discount must be in [0, 10000] basis points.');
            }

            return;
        }
        if ($type === CorePromotion::TYPE_FIXED) {
            if ($fixed === null || $bp !== null) {
                throw new BillingDomainException('promo_discount_invalid', 'Fixed promotions require discount_value_toman and no percent value.');
            }
            if ($fixed < 0) {
                throw new BillingArithmeticException('money_negative', 'Fixed discount must be non-negative.');
            }

            return;
        }

        throw new BillingDomainException('promo_discount_invalid', 'Promotion discount_type must be percent or fixed.');
    }

    private function assertValidWindow(?CarbonImmutable $from, ?CarbonImmutable $until): void
    {
        if ($from !== null && $until !== null && $until->lt($from)) {
            throw new BillingDomainException('promo_window_invalid', 'Promotion ends_at must be on or after starts_at.');
        }
    }

    private function assertValidLimits(?int $max, ?int $perOwner): void
    {
        if ($max !== null && $max < 0) {
            throw new BillingDomainException('promo_limit_invalid', 'max_redemptions must be non-negative.');
        }
        if ($perOwner !== null && $perOwner < 0) {
            throw new BillingDomainException('promo_limit_invalid', 'per_owner_limit must be non-negative.');
        }
    }
}
