<?php

namespace App\Core\Identity;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single-use email-verification challenge (Stage C6-2). Only
 * the SHA-256 hash of the token is stored (hidden from
 * serialization). A challenge is bound to one user and one exact
 * normalized address; changing the address invalidates it.
 */
class EmailVerificationChallenge extends Model
{
    protected $table = 'core_email_verification_challenges';

    protected $fillable = [
        'user_id', 'email_normalized', 'token_hash', 'expires_at', 'consumed_at',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
