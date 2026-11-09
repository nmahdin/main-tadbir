<?php

namespace App\Core\Billing;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * C5-M2-S4 immutable itemized order line (insert-only).
 *
 * Kinds: plan (subtotal), discount (negative), tax.
 *
 * @property int $id
 * @property int $order_id
 * @property string $kind
 * @property string $description
 * @property int $amount_toman
 * @property int|null $price_id
 * @property int|null $tax_rate_basis_points
 */
class CoreBillingOrderLine extends Model
{
    public const KIND_PLAN = 'plan';

    public const KIND_DISCOUNT = 'discount';

    public const KIND_TAX = 'tax';

    public const UPDATED_AT = null;

    protected $table = 'core_billing_order_lines';

    protected $fillable = [
        'order_id',
        'kind',
        'description',
        'amount_toman',
        'price_id',
        'tax_rate_basis_points',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'order_id' => 'integer',
            'amount_toman' => 'integer',
            'price_id' => 'integer',
            'tax_rate_basis_points' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }

    public function price(): BelongsTo
    {
        return $this->belongsTo(CorePlanPrice::class, 'price_id');
    }
}
