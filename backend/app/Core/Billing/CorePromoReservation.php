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
 */
class CorePromoReservation extends Model
{
    public const STATE_RESERVED = 'reserved';

    public const STATE_RELEASED = 'released';

    public const STATE_EXPIRED = 'expired';

    public const STATE_REDEEMED = 'redeemed';

    protected $table = 'core_billing_promo_reservations';

    protected $fillable = [
        'quote_id',
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

    public function isConsumingCapacity(): bool
    {
        return $this->state === self::STATE_RESERVED;
    }
}
