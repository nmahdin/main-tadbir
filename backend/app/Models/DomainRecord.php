<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

    protected static function booted(): void
    {
        static::deleting(function (self $record): void {
            if ($record->domain === self::DOMAIN_ASSET) {
                $record->comments()->delete();
            }
        });
    }

    protected $casts = [
        'payload' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'subject_id')->where('subject_type', 'asset')->oldest();
    }
}
