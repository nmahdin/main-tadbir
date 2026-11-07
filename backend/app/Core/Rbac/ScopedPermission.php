<?php

namespace App\Core\Rbac;

use Database\Factories\ScopedPermissionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Database mirror of one PermissionCatalog entry. Rows are materialized
 * by PermissionCatalog::sync(); application code never invents keys by
 * writing this table directly.
 */
class ScopedPermission extends Model
{
    /** @use HasFactory<ScopedPermissionFactory> */
    use HasFactory;

    protected $table = 'core_permissions';

    protected $fillable = [
        'key', 'scope', 'name',
    ];

    protected static function newFactory(): ScopedPermissionFactory
    {
        return ScopedPermissionFactory::new();
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(ScopedRole::class, 'core_role_permissions', 'permission_id', 'role_id')
            ->withTimestamps();
    }
}
