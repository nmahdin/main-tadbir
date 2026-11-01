<?php

namespace App\Core\Billing;

use App\Core\Plans\CorePlanVersion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable-after-publication price revision (C5-M2-S1).
 *
 * Draft rows are created through PlanPricePublisher and remain
 * mutable only until they are published, at which point they
 * become immutable and retain their amounts for the lifetime of
 * any quote that locked them (SPEC-C5-M2 §3.2).
 *
 * @property int $id
 * @property int $plan_version_id
 * @property string $period
 * @property int $amount_toman
 * @property bool $is_published
 * @property \Illuminate\Support\Carbon|null $superseded_at
 * @property \Illuminate\Support\Carbon|null $published_at
 * @property int|null $created_by
 */
class CorePlanPrice extends Model
{
    public const PERIOD_MONTHLY = 'monthly';
    public const PERIOD_ANNUAL = 'annual';
    public const PERIODS = [self::PERIOD_MONTHLY, self::PERIOD_ANNUAL];

    protected $table = 'core_plan_prices';

    protected $fillable = [
        'plan_version_id',
        'period',
        'amount_toman',
        'is_published',
        'superseded_at',
        'published_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'amount_toman' => 'integer',
            'is_published' => 'boolean',
            'superseded_at' => 'datetime',
            'published_at' => 'datetime',
            'created_by' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (self $price): void {
            if ($price->getOriginal('published_at') !== null
                && ($price->isDirty('amount_toman')
                    || $price->isDirty('period')
                    || $price->isDirty('plan_version_id'))) {
                throw new BillingDomainException(
                    'price_immutable',
                    'A published price revision is immutable.',
                );
            }
        });

        static::deleting(function (self $price): void {
            if ($price->published_at !== null) {
                throw new BillingDomainException(
                    'price_immutable',
                    'A published price revision cannot be deleted.',
                );
            }
        });
    }

    public function planVersion(): BelongsTo
    {
        return $this->belongsTo(CorePlanVersion::class, 'plan_version_id');
    }

    public function isPublished(): bool
    {
        return $this->published_at !== null;
    }

    public function isSuperseded(): bool
    {
        return $this->superseded_at !== null;
    }

    public function money(): MoneyToman
    {
        return MoneyToman::of((int) $this->amount_toman);
    }
}
