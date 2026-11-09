<?php

namespace App\Core\Billing;

use App\Core\Billing\Documents\BillingDocumentType;
use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * C5-M2-S4 order review snapshot (SPEC-C5-M2 §3.4).
 *
 * A billing_order is created atomically from a quote at conversion
 * time. Monetary amounts are COPIED from the quote and NEVER
 * recomputed; if tax/promo/catalog change later the order remains
 * an accurate historical record. The order carries its own
 * review_expires_at independent of the quote TTL.
 *
 * Lifecycle in S4: in_review → cancelled | review_expired. Payment
 * states are reserved for M3; API explicitly reports
 * payment_initiated: false.
 *
 * @property int $id
 * @property int $quote_id
 * @property string $owner_key
 * @property int|null $organization_id
 * @property int|null $personal_workspace_id
 * @property string $period
 * @property int $subtotal_toman
 * @property int $discount_toman
 * @property int $tax_toman
 * @property int $total_toman
 * @property int|null $promo_id
 * @property string|null $promo_code_snapshot
 * @property int|null $tax_rule_id
 * @property int|null $tax_rate_basis_points
 * @property string $status
 * @property Carbon $review_expires_at
 * @property Carbon|null $cancelled_at
 * @property Carbon|null $expired_at
 * @property string $idempotency_key
 * @property string|null $payload_hash
 * @property int|null $created_by_user_id
 * @property int|null $cancelled_by_user_id
 */
class CoreBillingOrder extends Model
{
    public const STATUS_IN_REVIEW = 'in_review';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_REVIEW_EXPIRED = 'review_expired';

    // Future M3 payment states (not set in S4 but declared for
    // forward-compatible state-machine helpers).
    public const STATUS_PAYABLE_PENDING = 'payable_pending';

    public const STATUS_PAID = 'paid';

    protected $table = 'core_billing_orders';

    protected $fillable = [
        'quote_id',
        'owner_key',
        'organization_id',
        'personal_workspace_id',
        'period',
        'subtotal_toman',
        'discount_toman',
        'tax_toman',
        'total_toman',
        'promo_id',
        'promo_code_snapshot',
        'tax_rule_id',
        'tax_rate_basis_points',
        'status',
        'review_expires_at',
        'idempotency_key',
        'payload_hash',
        'created_by_user_id',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $order): void {
            $hasOrganization = $order->organization_id !== null;
            $hasWorkspace = $order->personal_workspace_id !== null;
            if ($hasOrganization === $hasWorkspace) {
                throw new BillingDomainException(
                    'order_owner_invalid',
                    'An order requires exactly one owner: an organization or a personal workspace.',
                );
            }
        });
    }

    protected function casts(): array
    {
        return [
            'quote_id' => 'integer',
            'organization_id' => 'integer',
            'personal_workspace_id' => 'integer',
            'subtotal_toman' => 'integer',
            'discount_toman' => 'integer',
            'tax_toman' => 'integer',
            'total_toman' => 'integer',
            'promo_id' => 'integer',
            'tax_rule_id' => 'integer',
            'tax_rate_basis_points' => 'integer',
            'review_expires_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'expired_at' => 'datetime',
            'created_by_user_id' => 'integer',
            'cancelled_by_user_id' => 'integer',
        ];
    }

    public static function ownerKeyForOrganization(int $organizationId): string
    {
        return CoreBillingQuote::ownerKeyForOrganization($organizationId);
    }

    public static function ownerKeyForPersonalWorkspace(int $workspaceId): string
    {
        return CoreBillingQuote::ownerKeyForPersonalWorkspace($workspaceId);
    }

    public function isInReview(): bool
    {
        return $this->status === self::STATUS_IN_REVIEW;
    }

    public function isReviewExpiredAt(CarbonImmutable $at): bool
    {
        return $at->gte($this->review_expires_at);
    }

    /**
     * S4 cancellation must only succeed while the order is in review
     * AND (defensive) payment has not been initiated.
     */
    public function isCancellableAt(CarbonImmutable $at): bool
    {
        return $this->status === self::STATUS_IN_REVIEW && $at->lt($this->review_expires_at);
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(CoreBillingQuote::class, 'quote_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function personalWorkspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class, 'personal_workspace_id');
    }

    public function promo(): BelongsTo
    {
        return $this->belongsTo(CorePromotion::class, 'promo_id');
    }

    public function taxRule(): BelongsTo
    {
        return $this->belongsTo(CoreTaxRule::class, 'tax_rule_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(CoreBillingOrderLine::class, 'order_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(CorePromoReservation::class, 'order_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CoreBillingPayment::class, 'order_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CoreBillingDocument::class, 'order_id');
    }

    public function invoices(): HasMany
    {
        return $this->documents()->where('doc_type', BillingDocumentType::INVOICE->value);
    }

    public function receipts(): HasMany
    {
        return $this->documents()->where('doc_type', BillingDocumentType::RECEIPT->value);
    }

    public function scopeForOwnerKey(Builder $query, string $ownerKey): Builder
    {
        return $query->where('owner_key', $ownerKey);
    }

    public function scopeInReview(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_IN_REVIEW);
    }
}
