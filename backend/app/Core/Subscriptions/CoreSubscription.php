<?php

namespace App\Core\Subscriptions;

use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlanVersion;
use App\Core\Workspaces\Workspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The one current subscription of exactly one owner (Stage C5-2):
 * an organization (covering its organization-owned workspaces) XOR
 * a personal workspace. The database-backed generated `owner_key`
 * unique index enforces at most one row per owner; renewals update
 * this row and append immutable period history instead of creating
 * new subscriptions. `plan_version_id` always references the last
 * valid published plan version — including after expiry, so C5-3
 * can determine previously entitled modules.
 */
class CoreSubscription extends Model
{
    protected $table = 'core_subscriptions';

    protected $fillable = [
        'organization_id', 'personal_workspace_id', 'plan_version_id',
        'starts_at', 'expires_at', 'grace_ends_at', 'status_version',
        'created_by_user_id', 'updated_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'grace_ends_at' => 'datetime',
            'status_version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $subscription): void {
            $hasOrganization = $subscription->organization_id !== null;
            $hasWorkspace = $subscription->personal_workspace_id !== null;

            if ($hasOrganization === $hasWorkspace) {
                throw new SubscriptionException(
                    'subscription_owner_invalid',
                    'A subscription requires exactly one owner: an organization or a personal workspace.',
                );
            }
        });
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

    public function periods(): HasMany
    {
        return $this->hasMany(SubscriptionPeriod::class, 'subscription_id');
    }

    public function isOrganizationOwned(): bool
    {
        return $this->organization_id !== null;
    }

    public function ownerKey(): string
    {
        return $this->isOrganizationOwned()
            ? 'org:'.(int) $this->organization_id
            : 'ws:'.(int) $this->personal_workspace_id;
    }
}
