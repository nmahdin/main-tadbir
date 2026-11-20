<?php

namespace App\Core\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Append-only event log for a support ticket.
 *
 * @property int $id
 * @property int $ticket_id
 * @property int|null $actor_user_id
 * @property string $event_type
 * @property array|null $payload
 * @property Carbon $created_at
 */
class CoreSupportActivity extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'core_support_activity';

    protected $fillable = ['ticket_id', 'actor_user_id', 'event_type', 'payload'];

    protected function casts(): array
    {
        return [
            'ticket_id' => 'integer',
            'actor_user_id' => 'integer',
            'payload' => 'json',
        ];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(CoreSupportTicket::class, 'ticket_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
