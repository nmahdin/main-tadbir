<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Notifications\Services\NotificationInbox;
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
        'read_at',
        'category_key',
        'group_key',
    ];

    protected static function booted(): void
    {
        static::deleting(function (self $record): void {
            if ($record->domain === self::DOMAIN_ASSET) {
                $record->comments()->delete();
            }
        });

        // UX-02-4: keep the notification accelerator columns in sync
        // with the payload so every producer benefits without changes.
        $syncNotificationColumns = function (self $record): void {
            if ($record->domain !== self::DOMAIN_NOTIFICATION || ! is_array($record->payload)) {
                return;
            }
            $category = NotificationInbox::categoryOfPayload($record->payload);
            $record->category_key = $category;
            $record->group_key = NotificationInbox::groupKeyOf($record->payload, $category);
            $record->read_at = ! empty($record->payload['read']) ? ($record->read_at ?? now()) : null;
        };
        static::creating($syncNotificationColumns);
        static::updating($syncNotificationColumns);
    }

    protected $casts = [
        'payload' => 'array',
        'read_at' => 'datetime',
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
