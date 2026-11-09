<?php

namespace App\Core\Billing;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Transactional outbox row for payment → subscription fulfillment
 * (C5-M3-C). Written in the SAME transaction that finalizes a
 * payment; a dispatcher reads undispatched rows and invokes the
 * subscription fulfillment service. At-least-once delivery; the
 * uniqueness constraint on payments.fulfillment_event_id and
 * unique(period.correlation_id) make fulfillment idempotent.
 */
class CoreBillingFulfillmentOutbox extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'core_billing_fulfillment_outbox';

    protected $fillable = [
        'event_id', 'event_type', 'payment_id', 'order_id', 'owner_key',
        'payload', 'created_at', 'next_dispatch_after',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'json',
            'created_at' => 'datetime',
            'dispatched_at' => 'datetime',
            'next_dispatch_after' => 'datetime',
            'dispatch_attempts' => 'integer',
        ];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(CoreBillingPayment::class, 'payment_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }
}
