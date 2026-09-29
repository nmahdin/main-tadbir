<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DomainRecord extends Model
{
    public const DOMAIN_NOTIFICATION = 'notification';

    public const DOMAIN_ASSET_FOLDER = 'asset_folder';

    public const DOMAIN_ASSET = 'asset';

    public const DOMAIN_CONVERSATION = 'conversation';

    public const DOMAIN_CHAT_MESSAGE = 'chat_message';

    protected $fillable = [
        'notification_key',
        'domain',
        'user_id',
        'parent_id',
        'title',
        'status',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
