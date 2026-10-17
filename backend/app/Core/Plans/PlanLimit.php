<?php

namespace App\Core\Plans;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One resource limit of one plan version (Stage C5-1).
 *
 * Zero-versus-unlimited semantics are exact:
 *  - `limit_value = 0` with `is_unlimited = false` is a hard zero
 *    (the resource is not available at all);
 *  - `is_unlimited = true` removes the limit entirely and the
 *    stored `limit_value` is ignored by evaluators.
 * Resource keys are validated against PlanResourceCatalog before
 * any row is written. Identity is the composite
 * (plan_version_id, resource_key) primary key.
 */
class PlanLimit extends Model
{
    protected $table = 'core_plan_limits';

    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = null;

    protected $fillable = ['plan_version_id', 'resource_key', 'limit_value', 'is_unlimited'];

    protected function casts(): array
    {
        return [
            'limit_value' => 'integer',
            'is_unlimited' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        $guard = function (self $limit): void {
            $version = CorePlanVersion::query()->find($limit->plan_version_id);

            if ($version !== null && $version->isPublished()) {
                throw new PlanProvisioningException(
                    'plan_version_immutable',
                    'Limits of a published plan version are immutable.',
                );
            }
        };

        static::creating($guard);
        static::updating($guard);
        static::deleting($guard);
    }

    public function planVersion(): BelongsTo
    {
        return $this->belongsTo(CorePlanVersion::class, 'plan_version_id');
    }

    public function isUnlimited(): bool
    {
        return $this->is_unlimited;
    }
}
