<?php

namespace App\Core\Plans;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A commercial plan definition (Stage C5-1). The `key` is the
 * stable identity used by provisioning and is immutable once the
 * plan exists; `status` moves draft -> active -> retired (retiring
 * a draft directly is also permitted). A plan carries no price or
 * billing semantics in C5-1.
 */
class CorePlan extends Model
{
    public const AUDIENCE_PERSONAL = 'personal';

    public const AUDIENCE_ORGANIZATION = 'organization';

    public const STATUS_DRAFT = 'draft';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_RETIRED = 'retired';

    public const AUDIENCES = [self::AUDIENCE_PERSONAL, self::AUDIENCE_ORGANIZATION];

    public const STATUSES = [self::STATUS_DRAFT, self::STATUS_ACTIVE, self::STATUS_RETIRED];

    protected $fillable = ['key', 'name', 'audience', 'status'];

    protected static function booted(): void
    {
        static::updating(function (self $plan): void {
            if ($plan->isDirty('key')) {
                throw new PlanProvisioningException(
                    'plan_drift',
                    'A plan key is its stable identity and cannot be changed.',
                );
            }
        });
    }

    public function versions(): HasMany
    {
        return $this->hasMany(CorePlanVersion::class, 'plan_id');
    }

    public function isRetired(): bool
    {
        return $this->status === self::STATUS_RETIRED;
    }
}
