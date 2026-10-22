<?php

namespace App\Core\Platform;

use App\Core\Rbac\ScopedPermission;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A global platform-administration role (Stage C2-1).
 *
 * Deliberately separate from Core\Rbac\ScopedRole: platform roles
 * have no scope container, are database-managed (except the
 * protected `primary_administrator`, whose definition is fixed by
 * PlatformRoleProvisioner), and never grant workspace operational
 * access. `version` is an optimistic-concurrency/provisioning
 * marker carried for future role management; C2-1 never changes it.
 */
class PlatformRole extends Model
{
    protected $fillable = [
        'key', 'name', 'description', 'is_protected', 'version',
    ];

    protected function casts(): array
    {
        return [
            'is_protected' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(
            ScopedPermission::class,
            'platform_role_permissions',
            'platform_role_id',
            'permission_id',
        );
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(PlatformRoleAssignment::class, 'platform_role_id');
    }
}
