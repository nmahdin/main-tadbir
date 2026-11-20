<?php

namespace App\Core\Security\Mfa;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoreMfaRecoveryCode extends Model
{
    protected $table = 'security_mfa_recovery_codes';

    protected $fillable = ['user_id', 'code_hash'];

    protected function casts(): array
    {
        return [
            'used_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function factor(): BelongsTo
    {
        return $this->belongsTo(CoreMfaFactor::class, 'used_by_factor_id');
    }
}
