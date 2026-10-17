<?php

namespace App\Core\Plans;

use App\Core\Modules\CoreModule;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Whether one plan version allows one module (Stage C5-1 stored
 * entitlement contract). Absence of a row means "not decided by
 * this version" and must be read as not allowed by evaluators.
 *
 * Identity is the composite (plan_version_id, module_id) primary
 * key — there is no surrogate id and duplicates are impossible.
 * Rows of a published version are immutable at the domain layer
 * (guarded on create/update/delete); provisioning writes go
 * through PlanProvisioner, which enforces the same rule before
 * using query-level upserts.
 */
class PlanModuleEntitlement extends Model
{
    protected $table = 'core_plan_module_entitlements';

    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = null;

    protected $fillable = ['plan_version_id', 'module_id', 'is_allowed'];

    protected function casts(): array
    {
        return ['is_allowed' => 'boolean'];
    }

    protected static function booted(): void
    {
        $guard = function (self $entitlement): void {
            $version = CorePlanVersion::query()->find($entitlement->plan_version_id);

            if ($version !== null && $version->isPublished()) {
                throw new PlanProvisioningException(
                    'plan_version_immutable',
                    'Entitlements of a published plan version are immutable.',
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

    public function module(): BelongsTo
    {
        return $this->belongsTo(CoreModule::class, 'module_id');
    }
}
