<?php

namespace App\Core\Security\Mfa;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property string $type
 * @property string $secret_encrypted
 * @property string $status
 * @property string|null $recovery_nonce
 * @property \Carbon\CarbonImmutable|null $activated_at
 * @property \Carbon\CarbonImmutable|null $last_used_at
 */
class CoreMfaFactor extends Model
{
    protected $table = 'security_mfa_factors';

    protected $fillable = [
        'user_id', 'type', 'secret_encrypted', 'status', 'recovery_nonce',
        'failed_attempts', 'locked_until',
    ];

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'last_used_at' => 'datetime',
            'locked_until' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
