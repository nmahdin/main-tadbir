<?php

namespace App\Bot\Bale\Notifications;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\MessageText;
use App\Models\BaleUserLink;
use App\Models\DomainRecord;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

final class NotificationDelivery
{
    private int $deferred = 0;

    public function deferred(\Closure $callback): mixed
    {
        $this->deferred++;
        try {
            return $callback();
        } finally {
            $this->deferred--;
        }
    }

    public function created(DomainRecord $record): void
    {
        if ($record->domain !== DomainRecord::DOMAIN_NOTIFICATION) {
            return;
        }
        try {
            $settings = app(Settings::class);
            if (! $settings->ready()) {
                return;
            }
            $link = BaleUserLink::where('user_id', $record->user_id)->first();
            $user = User::find($record->user_id);
            if (! $link || ! $link->notifications_enabled || ! $user || ! app(NotificationAccess::class)->canDeliver($user, $record)) {
                return;
            }
            $message = app(Outbox::class)->enqueue('notification:'.($record->notification_key ?? $record->id).':'.$link->id, $link->chat_id, [
                'text' => \App\Bot\Bale\Support\NotificationText::render($record),
            ], $link, 'notification', $record->id);
            if ($this->deferred === 0) {
                DB::afterCommit(fn () => $this->sendNow([$message->id]));
            }
        } catch (Throwable) {
            // Never undo an internal notification because Bale or its integration is unavailable.
            Log::warning('bale_notification_enqueue_failed', ['notification_id' => $record->id]);
        }
    }

    public function sendNow(?array $ids = null): int
    {
        if (DB::transactionLevel() > 0) {
            DB::afterCommit(fn () => $this->sendNow($ids));

            return 0;
        }
        $lock = Cache::lock('bale:runtime', 90);
        if (! $lock->get()) {
            return 0;
        } // A poll already holding the lock will drain pending work.
        try {
            return app(Outbox::class)->flush(microtime(true) + config('bale.tick_seconds'), $ids);
        } catch (Throwable) {
            Log::warning('bale_immediate_delivery_failed');

            return 0;
        } finally {
            $lock->release();
        }
    }
}
