<?php

namespace App\Core\Subscriptions;

use App\Core\Plans\CorePlanVersion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable subscription period (Stage C5-2): the initial
 * assignment or a renewal, with its effective window, the
 * authorized actor, the mandatory reason, and the caller-supplied
 * correlation/idempotency identifier (unique per subscription, so
 * retried mutations return the recorded period instead of applying
 * twice). Past periods are never altered — model guards refuse
 * updates and deletes. Lifecycle events are additionally written
 * to the transactional C1 audit log by SubscriptionService, so no
 * separate events table duplicates that record.
 */
class SubscriptionPeriod extends Model
{
    public const OPERATION_INITIAL = 'initial';

    public const OPERATION_RENEWAL = 'renewal';

    protected $table = 'core_subscription_periods';

    protected $fillable = [
        'subscription_id', 'plan_version_id', 'operation',
        'effective_starts_at', 'expires_at', 'grace_ends_at',
        'reason', 'correlation_id', 'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'effective_starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'grace_ends_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        $immutable = function (self $period): void {
            throw new SubscriptionException(
                'subscription_period_immutable',
                'Subscription period history is immutable.',
            );
        };

        static::updating($immutable);
        static::deleting($immutable);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(CoreSubscription::class, 'subscription_id');
    }

    public function planVersion(): BelongsTo
    {
        return $this->belongsTo(CorePlanVersion::class, 'plan_version_id');
    }
}
