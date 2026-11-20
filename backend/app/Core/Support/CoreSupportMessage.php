<?php

namespace App\Core\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $ticket_id
 * @property int $author_user_id
 * @property string $author_role
 * @property string $body
 * @property bool $internal_note
 * @property array|null $attachments
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class CoreSupportMessage extends Model
{
    protected $table = 'core_support_messages';

    protected $fillable = [
        'ticket_id', 'author_user_id', 'author_role',
        'body', 'internal_note', 'attachments',
    ];

    protected function casts(): array
    {
        return [
            'ticket_id' => 'integer',
            'author_user_id' => 'integer',
            'internal_note' => 'boolean',
            'attachments' => 'json',
        ];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(CoreSupportTicket::class, 'ticket_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_user_id');
    }

    public function isVisibleToRequester(): bool
    {
        return ! $this->internal_note;
    }
}
