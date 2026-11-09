<?php

namespace App\Core\Billing;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable append-only event log for a payment attempt.
 *
 * Every transition writes a row here; the gateway adapter is
 * responsible for redacting secrets before we persist its
 * diagnostics in the `data` JSON column.
 */
class CoreBillingPaymentEvent extends Model
{
    public const ACTOR_USER = 'user';

    public const ACTOR_SYSTEM = 'system';

    public const ACTOR_PROVIDER = 'provider';

    protected $table = 'core_billing_payment_events';

    protected $fillable = [
        'payment_id', 'event', 'from_status', 'to_status',
        'data', 'actor_user_id', 'actor_type', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'json',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $ev): void {
            if ($ev->occurred_at === null) {
                $ev->occurred_at = CarbonImmutable::now('UTC');
            }
        });
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(CoreBillingPayment::class, 'payment_id');
    }

    public function actorUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
