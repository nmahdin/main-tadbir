<?php

namespace App\Core\Workspaces;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationAccessGuard;
use App\Models\User;
use Database\Factories\WorkspaceFactory;
use DomainException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A workspace: the strict operational data boundary (Stage 03A foundation).
 *
 * Exactly one owner, enforced in the model on every save (and by a CHECK
 * constraint on MySQL — see the Stage 03A migration for the documented
 * SQLite non-equivalence): either owner_user_id (personal) or
 * organization_id (organizational), never both, never neither.
 */
class Workspace extends Model
{
    /** @use HasFactory<WorkspaceFactory> */
    use HasFactory;

    protected $fillable = [
        'name', 'owner_user_id', 'organization_id', 'is_default', 'status',
    ];

    /**
     * Generated discriminator columns exist only to give the database a
     * unique-index target for the one-default-workspace rule; they are
     * internal constraint machinery, not API fields.
     *
     * @var list<string>
     */
    protected $hidden = [
        'default_personal_owner_id', 'default_organization_id',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $workspace): void {
            $hasUserOwner = $workspace->owner_user_id !== null;
            $hasOrganizationOwner = $workspace->organization_id !== null;

            if ($hasUserOwner === $hasOrganizationOwner) {
                throw new DomainException('A workspace must have exactly one owner: a user or an organization.');
            }
        });

        // Stage C3-3: no new organization-owned workspaces while
        // the organization is suspended or ended. Existing
        // workspaces (and personal workspaces) are unaffected —
        // this guards creation only, never updates.
        static::creating(function (self $workspace): void {
            if ($workspace->organization_id !== null) {
                app(OrganizationAccessGuard::class)->assertOperationalAccess($workspace->organization);
            }
        });
    }

    protected static function newFactory(): WorkspaceFactory
    {
        return WorkspaceFactory::new();
    }

    public function ownerUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(WorkspaceMembership::class);
    }

    public function isPersonal(): bool
    {
        return $this->owner_user_id !== null;
    }

    public function isOrganizational(): bool
    {
        return $this->organization_id !== null;
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function scopePersonal(Builder $query): Builder
    {
        return $query->whereNotNull('owner_user_id');
    }

    public function scopeOrganizational(Builder $query): Builder
    {
        return $query->whereNotNull('organization_id');
    }
}
