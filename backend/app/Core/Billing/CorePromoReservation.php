<?php

namespace App\Core\Billing;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * C5-M2-S3 promotion reservation row (M2-D4=A).
 *
 * A 'reserved' reservation counts against core_promotions.max_redemptions
 * until it is released, expired, or redeemed. Rows are append-only
 * audit records: released/expired/redemption events flip state and
 * stamp released_at rather than deleting the row.
 *
 * @property int $id
 * @property int $quote_id
 * @property int $promo_id
 * @property string $owner_key
 * @property string $state
 * @property Carbon|null $released_at
 * @property string $idempotency_key
 * @property int|null $order_id
 */
class CorePromoReservation extends Model
{
    public const STATE_RESERVED = 'reserved';

    public const STATE_RELEASED = 'released';

    public const STATE_EXPIRED = 'expired';

    /**
     * Reservation transferred to an order during S4 conversion. The
     * slot still counts toward global/per-owner capacity (so it is
     * NOT free), but it is now anchored to the order instead of the
     * quote. M3 payment will flip this to REDEEMED; order cancel or
     * review-expiry flips it to RELEASED.
     */
    public const STATE_CONVERTED = 'converted';

    public const STATE_REDEEMED = 'redeemed';

    protected $table = 'core_billing_promo_reservations';

    protected $fillable = [
        'quote_id',
        'order_id',
        'promo_id',
        'owner_key',
        'state',
        'released_at',
        'idempotency_key',
    ];

    protected function casts(): array
    {
        return [
            'quote_id' => 'integer',
            'order_id' => 'integer',
            'promo_id' => 'integer',
            'released_at' => 'datetime',
        ];
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(CoreBillingQuote::class, 'quote_id');
    }

    public function promo(): BelongsTo
    {
        return $this->belongsTo(CorePromotion::class, 'promo_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }

    /**
     * A reservation counts against promo capacity while it is in
     * RESERVED (quote holds it) or CONVERTED (order holds it). Once
     * released/expired/redeemed the slot is freed or finalized.
     */
    public function isConsumingCapacity(): bool
    {
        return in_array($this->state, [self::STATE_RESERVED, self::STATE_CONVERTED], true);
    }
}
