<?php

namespace App\Core\Platform;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One user's platform role assignment (Stage C2-1 schema).
 *
 * At most one assignment per user is active (`revoked_at` NULL),
 * enforced by the generated `active_user_id` unique index.
 * Revocation is soft: history rows are retained forever. Actor
 * references are nullable by design — infrastructure-initiated
 * actions never invent a user identity; the auditable
 * operational-actor contract belongs to the later recovery stage.
 *
 * Grant/revoke/replace services are C2-2 and intentionally absent.
 */
class PlatformRoleAssignment extends Model
{
    protected $fillable = [
        'user_id', 'platform_role_id', 'granted_by_user_id', 'revoked_by_user_id', 'revoked_at',
    ];

    /**
     * The generated active_user_id column is constraint machinery,
     * not an API field.
     *
     * @var list<string>
     */
    protected $hidden = [
        'active_user_id',
    ];

    protected function casts(): array
    {
        return [
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(PlatformRole::class, 'platform_role_id');
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }
}
