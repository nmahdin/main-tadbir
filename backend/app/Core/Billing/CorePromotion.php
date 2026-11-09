<?php

namespace App\Core\Billing;

use App\Core\Billing\Exceptions\BillingArithmeticException;
use App\Core\Billing\Exceptions\BillingDomainException;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * C5-M2-S2 promotion code (Q2=A: one promo per quote, no stacking).
 *
 * Discount is either percent (discount_value_bp, integer basis
 * points 0–10000) or fixed (discount_value_toman, whole Toman).
 * Validity window is enforced by PromotionService::evaluate();
 * redemption capacity (max_redemptions, per_owner_limit) is
 * reserved in the future S3 quote-creation transaction and
 * consumed only on successful payment (M2-D4=A; this model only
 * holds redeemed_count, incremented by PromotionService::redeem()
 * in S3).
 *
 * Codes are normalized to uppercase + trimmed on create; lookup
 * uses the normalized form. Rows are deactivated, not deleted,
 * for audit (deactivated_at/by preserved).
 *
 * @property int $id
 * @property string $code
 * @property string $label
 * @property string $discount_type // 'percent' | 'fixed'
 * @property int|null $discount_value_bp
 * @property int|null $discount_value_toman
 * @property bool $is_active
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int|null $max_redemptions
 * @property int|null $per_owner_limit
 * @property int $redeemed_count
 * @property int|null $created_by
 * @property int|null $deactivated_by
 * @property Carbon|null $deactivated_at
 */
class CorePromotion extends Model
{
    public const TYPE_PERCENT = 'percent';

    public const TYPE_FIXED = 'fixed';

    protected $table = 'core_promotions';

    protected $fillable = [
        'code',
        'label',
        'discount_type',
        'discount_value_bp',
        'discount_value_toman',
        'is_active',
        'starts_at',
        'ends_at',
        'max_redemptions',
        'per_owner_limit',
        'redeemed_count',
        'created_by',
        'deactivated_by',
        'deactivated_at',
    ];

    protected function casts(): array
    {
        return [
            'discount_value_bp' => 'integer',
            'discount_value_toman' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'max_redemptions' => 'integer',
            'per_owner_limit' => 'integer',
            'redeemed_count' => 'integer',
            'created_by' => 'integer',
            'deactivated_by' => 'integer',
            'deactivated_at' => 'datetime',
        ];
    }

    public static function normalizeCode(string $raw): string
    {
        return strtoupper(trim($raw));
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function deactivator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deactivated_by');
    }

    public function isValidAt(CarbonInterface $at): bool
    {
        if (!$this->is_active) {
            return false;
        }
        if ($this->starts_at !== null && $at->lt($this->starts_at)) {
            return false;
        }
        if ($this->ends_at !== null && $at->gte($this->ends_at)) {
            return false;
        }

        return true;
    }

    /**
     * Compute discount for the given subtotal. Caps discount at
     * subtotal (total never goes negative). Returns integer Toman.
     * Uses MoneyToman percentage for percent discounts
     * (round-half-up, overflow-checked).
     */
    public function computeDiscount(int $subtotalToman): int
    {
        if ($subtotalToman < 0) {
            throw new BillingArithmeticException('money_negative', 'Subtotal must be non-negative.');
        }

        if ($this->discount_type === self::TYPE_PERCENT) {
            if ($this->discount_value_bp === null) {
                throw new BillingDomainException('promo_invalid', 'Percent promotion is missing a rate.');
            }

            return MoneyToman::of($subtotalToman)->percentage((int) $this->discount_value_bp)->toInt();
        }

        // fixed
        $fixed = (int) ($this->discount_value_toman ?? 0);

        return min($fixed, $subtotalToman);
    }
}
