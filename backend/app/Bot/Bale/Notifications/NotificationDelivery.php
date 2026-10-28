<?php

namespace App\Bot\Bale\Notifications;

use App\Bot\Bale\Handlers\ContentPublishInfo;
use App\Bot\Bale\Handlers\ContentStageOutputs;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PanelLinks;
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
            if (! $link || ! $link->notifications_enabled || ! $user
                || ! app(NotificationCatalog::class)->allows($link, $record)
                || ! app(NotificationAccess::class)->canDeliver($user, $record)) {
                return;
            }
            // وظیفهٔ انتشار محتوا دکمهٔ «دریافت اطلاعات انتشار» را همراه اعلان
            // می‌فرستد: خروجی‌ها، کپشن و زمان انتشار از همان‌جا در دسترس است.
            $rows = app(ContentPublishInfo::class)->notificationRows($user, $record);
            // اعلانِ واگذاریِ وظیفهٔ مرحلهٔ محتوا: دکمهٔ «ثبت خروجی محتوا» همان‌جا
            // هست تا کاربر برای تحویل خروجی به منو برنگردد.
            if ($rows === []) {
                $rows = app(ContentStageOutputs::class)->notificationRows($user, $record);
            }
            // اعلان ایده: دو دکمهٔ مستقیم در مینی‌اپ — «باز کردن ایده» و
            // «نظر دادن» — تا کاربر برای دیدن یا نظر دادن روی ایدهٔ تازه لازم
            // نباشد خودش اتاق فکر را بگردد.
            if ($rows === [] && ! empty($record->payload['linkIdeaId'])) {
                $rows = app(PanelLinks::class)->ideaButtons($link, (int) $record->payload['linkIdeaId']);
            }
            $message = app(Outbox::class)->enqueue('notification:'.($record->notification_key ?? $record->id).':'.$link->id, $link->chat_id, [
                'text' => \App\Bot\Bale\Support\NotificationText::render($record),
                ...($rows ? ['reply_markup' => ['inline_keyboard' => $rows]] : []),
            ], $link, 'notification', $record->id);
            if ($this->deferred === 0) {
                // ارسال فوری از sendNow مدیریت می‌شود: بیرون از تراکنش همان‌جا و
                // درون تراکنش پس از commit.
                $this->sendNow([$message->id]);
            }
        } catch (Throwable) {
            // Never undo an internal notification because Bale or its integration is unavailable.
            Log::warning('bale_notification_enqueue_failed', ['notification_id' => $record->id]);
        }
    }

    /**
     * ارسال فوری پیام‌های در انتظار.
     *
     * `$deferred` فقط برای این است که فراخوانی بازگشتیِ ناشی از `afterCommit`
     * دوباره صف نکند: در برخی محیط‌ها (مثل تست‌های تراکنشی) `afterCommit`
     * همان لحظه اجرا می‌شود و سطح تراکنش هنوز بالاست؛ پیش‌تر این حالت تا
     * اتمام حافظه بازگشت می‌کرد و هیچ پیامی هم ارسال نمی‌شد.
     */
    public function sendNow(?array $ids = null, bool $deferred = false): int
    {
        if (DB::transactionLevel() > 0 && ! $deferred) {
            DB::afterCommit(fn () => $this->sendNow($ids, true));

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
