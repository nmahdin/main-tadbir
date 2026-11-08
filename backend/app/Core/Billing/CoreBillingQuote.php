<?php

namespace App\Core\Billing;

use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlanVersion;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * C5-M2-S3 immutable quote snapshot (SPEC-C5-M2 §3.4, M2-R4).
 *
 * Monetary values are frozen at creation time and never recomputed.
 * Price, promo, and tax references are preserved so that historical
 * audit can show what applied at the moment of quote — even if a
 * promo is later deactivated or the tax rate changes.
 *
 * @property int $id
 * @property string $owner_key
 * @property int|null $organization_id
 * @property int|null $personal_workspace_id
 * @property int $plan_version_id
 * @property int $price_id
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
 * @property Carbon $expires_at
 * @property Carbon|null $converted_at
 * @property int|null $superseded_by_quote_id
 * @property string $idempotency_key
 * @property string|null $payload_hash
 * @property int|null $created_by_user_id
 */
class CoreBillingQuote extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_SUPERSEDED = 'superseded';

    public const STATUS_CONVERTED = 'converted';

    protected $table = 'core_billing_quotes';

    protected $fillable = [
        'owner_key',
        'organization_id',
        'personal_workspace_id',
        'plan_version_id',
        'price_id',
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
        'expires_at',
        'idempotency_key',
        'payload_hash',
        'created_by_user_id',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $quote): void {
            $hasOrganization = $quote->organization_id !== null;
            $hasWorkspace = $quote->personal_workspace_id !== null;
            if ($hasOrganization === $hasWorkspace) {
                throw new BillingDomainException(
                    'quote_owner_invalid',
                    'A quote requires exactly one owner: an organization or a personal workspace.',
                );
            }
        });
    }

    protected function casts(): array
    {
        return [
            'organization_id' => 'integer',
            'personal_workspace_id' => 'integer',
            'plan_version_id' => 'integer',
            'price_id' => 'integer',
            'subtotal_toman' => 'integer',
            'discount_toman' => 'integer',
            'tax_toman' => 'integer',
            'total_toman' => 'integer',
            'promo_id' => 'integer',
            'tax_rule_id' => 'integer',
            'tax_rate_basis_points' => 'integer',
            'expires_at' => 'datetime',
            'converted_at' => 'datetime',
            'superseded_by_quote_id' => 'integer',
            'created_by_user_id' => 'integer',
        ];
    }

    public static function ownerKeyForOrganization(int $organizationId): string
    {
        return 'org:'.$organizationId;
    }

    public static function ownerKeyForPersonalWorkspace(int $workspaceId): string
    {
        return 'ws:'.$workspaceId;
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    public function isExpiredAt(CarbonImmutable $at): bool
    {
        return $at->gte($this->expires_at);
    }

    /**
     * S4 conversion lock contract: a quote is convertible only while
     * OPEN and strictly BEFORE expires_at. At the exact boundary the
     * quote is expired and conversion MUST fail (directive §3.7).
     */
    public function isConvertibleAt(CarbonImmutable $at): bool
    {
        return $this->status === self::STATUS_OPEN && $at->lt($this->expires_at);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function personalWorkspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class, 'personal_workspace_id');
    }

    public function planVersion(): BelongsTo
    {
        return $this->belongsTo(CorePlanVersion::class, 'plan_version_id');
    }

    public function price(): BelongsTo
    {
        return $this->belongsTo(CorePlanPrice::class, 'price_id');
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

    public function supersededBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'superseded_by_quote_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(CorePromoReservation::class, 'quote_id');
    }

    public function scopeForOwnerKey(Builder $query, string $ownerKey): Builder
    {
        return $query->where('owner_key', $ownerKey);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_OPEN);
    }

    /**
     * Seconds remaining until expiry; 0 if past expiry. Server-derived.
     */
    public function remainingSeconds(CarbonImmutable $at): int
    {
        return max(0, $this->expires_at->getTimestamp() - $at->timestamp);
    }
}
