<?php

namespace App\Core\Billing;

use App\Core\Organizations\Organization;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * C5-M3 — payment attempt (SPEC-C5-M3 §2).
 *
 * Each order may have multiple payment attempts until one settles
 * or the order expires. The row stores the immutable requested
 * amount/currency, provider identity, authoritative verification
 * outcome, and reconciliation bookkeeping. Events
 * (core_billing_payment_events) form the append-only audit log.
 */
class CoreBillingPayment extends Model
{
    public const STATUS_INITIATED = 'initiated';

    public const STATUS_PENDING = 'pending';     // provider confirms charge; waiting verification

    public const STATUS_PAID = 'paid';           // verified paid, pending fulfillment dispatch

    public const STATUS_FULFILLED = 'fulfilled'; // subscription activated/extended

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled'; // order cancelled before settlement

    public const STATUS_EXPIRED = 'expired';     // payment attempt abandoned due to order expiry

    public const STATUS_ZERO_SETTLED = 'zero_settled'; // zero-amount authorized settlement

    protected $table = 'core_billing_payments';

    protected $fillable = [
        'order_id', 'owner_key', 'organization_id', 'personal_workspace_id',
        'idempotency_key', 'payload_hash',
        'provider', 'provider_method', 'provider_payment_id', 'provider_authority',
        'requested_amount_toman', 'requested_currency',
        'verified_amount_toman', 'verified_currency',
        'provider_transaction_id', 'provider_trace_id',
        'status', 'return_url', 'created_by_user_id',
        'failure_code', 'failure_reason',
        'initiated_at', 'verified_at', 'finalized_at', 'fulfilled_at',
        'fulfillment_event_id',
    ];

    protected function casts(): array
    {
        return [
            'requested_amount_toman' => 'integer',
            'verified_amount_toman' => 'integer',
            'verification_attempts' => 'integer',
            'initiated_at' => 'datetime',
            'verified_at' => 'datetime',
            'last_provider_attempt_at' => 'datetime',
            'finalized_at' => 'datetime',
            'fulfilled_at' => 'datetime',
            'next_reconcile_after' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }

    public function personalWorkspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class, 'personal_workspace_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(CoreBillingPaymentEvent::class, 'payment_id')->orderBy('occurred_at');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CoreBillingDocument::class, 'payment_id');
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, [
            self::STATUS_FULFILLED,
            self::STATUS_FAILED,
            self::STATUS_CANCELLED,
            self::STATUS_EXPIRED,
            self::STATUS_ZERO_SETTLED,
        ], true);
    }

    public function requiresVerification(): bool
    {
        return in_array($this->status, [self::STATUS_INITIATED, self::STATUS_PENDING], true);
    }

    public static function ownerKeyFor(SubscriptionOwner $owner): string
    {
        return $owner->type === 'organization'
            ? 'org:'.(int) $owner->organization->id
            : 'ws:'.(int) $owner->personalWorkspace->id;
    }
}
