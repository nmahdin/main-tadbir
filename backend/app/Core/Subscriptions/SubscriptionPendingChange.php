<?php

namespace App\Core\Subscriptions;

use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Plans\CorePlanVersion;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * C5-M4-B pending future-effective plan change (downgrade). Rows
 * are scheduled by the plan-change service after a downgrade
 * purchase and applied at the end of the current paid term by the
 * lifecycle sweeper. At most one pending change per owner
 * (enforced by UNIQUE owner_key).
 */
class SubscriptionPendingChange extends Model
{
    public const UPDATED_AT = null;

    public const REASON_DOWNGRADE = 'downgrade_scheduled';

    protected $table = 'core_subscription_pending_changes';

    protected $fillable = [
        'owner_key', 'subscription_id', 'order_id', 'payment_id',
        'target_plan_version_id', 'reason', 'correlation_id',
        'effective_at', 'requested_by_user_id', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'effective_at' => 'datetime',
            'created_at' => 'datetime',
            'applied_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(CoreSubscription::class, 'subscription_id');
    }

    public function targetPlanVersion(): BelongsTo
    {
        return $this->belongsTo(CorePlanVersion::class, 'target_plan_version_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(CoreBillingPayment::class, 'payment_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function isApplicable(CarbonImmutable $at): bool
    {
        return $this->applied_at === null
            && $this->cancelled_at === null
            && $at->gte(CarbonImmutable::instance($this->effective_at));
    }
}
