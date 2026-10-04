<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/** Notify explicit followers only for meaningful, idempotently keyed events. */
final class ContentWatchNotifier
{
    public function meaningful(Content $content, User $actor, string $eventKey, string $message): int
    {
        $sent = 0;
        $content->watchers()->with('role')->where('users.id', '!=', $actor->id)->get()->each(
            function (User $recipient) use ($content, $eventKey, $message, &$sent): void {
                if (! app(ContentWatchAccess::class)->canFollow($recipient, $content)) return;
                $attributes = [
                    'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                    'user_id' => $recipient->id,
                    'title' => 'رویداد مهم محتوای دنبال‌شده',
                    'payload' => [
                        'userId' => (string) $recipient->id,
                        'title' => 'رویداد مهم محتوای دنبال‌شده',
                        'message' => $message,
                        'type' => 'content_watch',
                        'notificationCategory' => 'content',
                        'linkContentId' => (string) $content->id,
                        'read' => false,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ];
                if (Schema::hasColumn('domain_records', 'notification_key')) {
                    $record = DomainRecord::firstOrCreate([
                        'notification_key' => hash('sha256', 'content-watch:'.$eventKey.':'.$recipient->id),
                    ], $attributes);
                    if ($record->wasRecentlyCreated) $sent++;
                } else {
                    DomainRecord::create($attributes); $sent++;
                }
            },
        );
        return $sent;
    }
}
