<?php

namespace App\Core\Rbac;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use Database\Factories\ScopedRoleFactory;
use DomainException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A role in exactly one scope container (Stage 03B, ADR-0004).
 *
 * Invariants (model + DB, per ADR-0009):
 *  - scope "workspace"    => workspace_id set, organization_id null;
 *  - scope "organization" => organization_id set, workspace_id null;
 *  - (scope, owner, key) is unique at the database level via the
 *    generated scope_owner_id discriminator column;
 *  - a role only ever holds permission keys of its own scope;
 *  - protected roles (is_protected) are seeded defaults whose permission
 *    sets are fixed by RoleProvisioner — domain services refuse any
 *    mutation or deletion of them.
 */
class ScopedRole extends Model
{
    /** @use HasFactory<ScopedRoleFactory> */
    use HasFactory;

    protected $table = 'core_roles';

    protected $fillable = [
        'scope', 'organization_id', 'workspace_id', 'key', 'name', 'is_protected',
    ];

    /**
     * The generated scope_owner_id column is internal constraint
     * machinery, not an API field.
     *
     * @var list<string>
     */
    protected $hidden = [
        'scope_owner_id',
    ];

    protected function casts(): array
    {
        return [
            'is_protected' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $role): void {
            $role->assertScopeContainerMatches();
        });
    }

    protected static function newFactory(): ScopedRoleFactory
    {
        return ScopedRoleFactory::new();
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(ScopedPermission::class, 'core_role_permissions', 'role_id', 'permission_id')
            ->withTimestamps();
    }

    /** @return list<string> */
    public function permissionKeys(): array
    {
        return $this->permissions()->pluck('key')->all();
    }

    public function isWorkspaceScoped(): bool
    {
        return $this->scope === PermissionCatalog::SCOPE_WORKSPACE;
    }

    public function isOrganizationScoped(): bool
    {
        return $this->scope === PermissionCatalog::SCOPE_ORGANIZATION;
    }

    public function isProtected(): bool
    {
        return $this->is_protected;
    }

    public function scopeWorkspaceRoles(Builder $query): Builder
    {
        return $query->where('scope', PermissionCatalog::SCOPE_WORKSPACE);
    }

    public function scopeOrganizationRoles(Builder $query): Builder
    {
        return $query->where('scope', PermissionCatalog::SCOPE_ORGANIZATION);
    }

    private function assertScopeContainerMatches(): void
    {
        $valid = match ($this->scope) {
            PermissionCatalog::SCOPE_WORKSPACE => $this->workspace_id !== null && $this->organization_id === null,
            PermissionCatalog::SCOPE_ORGANIZATION => $this->organization_id !== null && $this->workspace_id === null,
            default => false,
        };

        if (! $valid) {
            throw new DomainException(
                "Role scope [{$this->scope}] does not match its scope container (organization_id/workspace_id)."
            );
        }
    }
}
