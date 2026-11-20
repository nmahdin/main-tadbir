<?php

namespace App\Core\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $ticket_id
 * @property int $uploader_user_id
 * @property string $storage_disk
 * @property string $storage_path
 * @property string $original_name
 * @property string $mime_type
 * @property int $size_bytes
 * @property string $access_token
 * @property Carbon|null $accessed_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class CoreSupportAttachment extends Model
{
    protected $table = 'core_support_attachments';

    protected $fillable = [
        'ticket_id', 'uploader_user_id', 'storage_disk', 'storage_path',
        'original_name', 'mime_type', 'size_bytes', 'access_token', 'accessed_at',
    ];

    protected function casts(): array
    {
        return [
            'ticket_id' => 'integer',
            'uploader_user_id' => 'integer',
            'size_bytes' => 'integer',
            'accessed_at' => 'datetime',
        ];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(CoreSupportTicket::class, 'ticket_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploader_user_id');
    }
}
