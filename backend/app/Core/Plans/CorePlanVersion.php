<?php

namespace App\Core\Plans;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One immutable-after-publication plan version (Stage C5-1).
 *
 * Draft versions are editable through PlanProvisioner. Once
 * `published_at` is set, the domain layer refuses changes to
 * identity (plan, version), `grace_days`, entitlements, limits,
 * and deletion. These are application-level guards: direct SQL can
 * still mutate rows, so they are not claimed as database-wide
 * immutability guarantees.
 */
class CorePlanVersion extends Model
{
    protected $fillable = ['plan_id', 'version', 'grace_days', 'published_at'];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'grace_days' => 'integer',
            'published_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (self $version): void {
            if ($version->getOriginal('published_at') !== null
                && ($version->isDirty('grace_days') || $version->isDirty('version') || $version->isDirty('plan_id'))) {
                throw new PlanProvisioningException(
                    'plan_version_immutable',
                    'A published plan version is immutable.',
                );
            }
        });

        static::deleting(function (self $version): void {
            if ($version->published_at !== null) {
                throw new PlanProvisioningException(
                    'plan_version_immutable',
                    'A published plan version cannot be deleted.',
                );
            }
        });
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(CorePlan::class, 'plan_id');
    }

    public function entitlements(): HasMany
    {
        return $this->hasMany(PlanModuleEntitlement::class, 'plan_version_id');
    }

    public function limits(): HasMany
    {
        return $this->hasMany(PlanLimit::class, 'plan_version_id');
    }

    public function isPublished(): bool
    {
        return $this->published_at !== null;
    }
}
