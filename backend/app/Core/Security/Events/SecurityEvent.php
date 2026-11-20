<?php

namespace App\Core\Security\Events;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SecurityEvent extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'security_events';

    protected $fillable = [
        'event_type', 'actor_user_id', 'actor_guard',
        'target_user_id', 'target_type', 'target_id',
        'scope_type', 'scope_id', 'outcome',
        'request_ip', 'correlation_id', 'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
