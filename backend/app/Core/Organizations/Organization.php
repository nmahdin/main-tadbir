<?php

namespace App\Core\Organizations;

use App\Core\Workspaces\Workspace;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An organization: owns billing/settings (future stages) and one or more
 * organization workspaces. Membership in an organization never by itself
 * grants access to a workspace's data (ADR-0003).
 */
class Organization extends Model
{
    /** @use HasFactory<OrganizationFactory> */
    use HasFactory;

    protected $fillable = [
        'name', 'slug', 'status', 'settings', 'created_by',
        'suspended_at', 'suspended_by_user_id', 'status_version',
    ];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'suspended_at' => 'datetime',
            'status_version' => 'integer',
        ];
    }

    protected static function newFactory(): OrganizationFactory
    {
        return OrganizationFactory::new();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function suspendedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'suspended_by_user_id');
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(OrganizationMembership::class);
    }

    public function workspaces(): HasMany
    {
        return $this->hasMany(Workspace::class);
    }

    public function defaultWorkspace(): HasMany
    {
        return $this->workspaces()->where('is_default', true);
    }

    public function isActive(): bool
    {
        return OrganizationStatus::of($this->status) === OrganizationStatus::Active;
    }

    public function isSuspended(): bool
    {
        return OrganizationStatus::of($this->status) === OrganizationStatus::Suspended;
    }
}
