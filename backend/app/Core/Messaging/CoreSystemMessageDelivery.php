<?php

namespace App\Core\Messaging;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Per-recipient delivery row. read_at and acknowledged_at are fully
 * independent: opening (marking read) never auto-satisfies a required
 * acknowledgment. Acknowledgment evidence is immutable — ack is
 * written once per (message,version,user) via ON DUPLICATE KEY UPDATE
 * of read_at only.
 *
 * @property int $id
 * @property int $message_id
 * @property int $version
 * @property int $user_id
 * @property int|null $organization_id
 * @property Carbon|null $read_at
 * @property Carbon|null $acknowledged_at
 * @property string|null $ack_evidence_hash
 * @property Carbon|null $first_delivered_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class CoreSystemMessageDelivery extends Model
{
    protected $table = 'core_system_message_deliveries';

    protected $fillable = [
        'message_id', 'version', 'user_id', 'organization_id',
        'read_at', 'acknowledged_at', 'ack_evidence_hash', 'first_delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'message_id' => 'integer',
            'version' => 'integer',
            'user_id' => 'integer',
            'organization_id' => 'integer',
            'read_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'first_delivered_at' => 'datetime',
        ];
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(CoreSystemMessage::class, 'message_id');
    }

    public function scopeForUser(Builder $q, int $userId): Builder
    {
        return $q->where('user_id', $userId);
    }

    public function scopeUnread(Builder $q): Builder
    {
        return $q->whereNull('read_at');
    }

    public function scopePendingAcknowledgment(Builder $q): Builder
    {
        return $q->whereNull('acknowledged_at');
    }
}
