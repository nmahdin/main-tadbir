<?php

namespace App\Services;

use App\Models\BaleUserLink;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use App\Support\Calendar\PersianCalendar;
use Illuminate\Support\Facades\Schema;

/**
 * یادآوری مسئول اجرای یک وظیفه.
 *
 * مسیر ارسال دقیقاً همان مسیر اعلان‌های سامانه است: یک رکورد اعلان برای مسئول
 * اجرا ساخته می‌شود (کارتابل و زنگ اعلان‌ها) و اگر کاربر ربات بله را وصل کرده
 * باشد، لایهٔ ارسال موجود همان اعلان را به بله هم می‌فرستد. بنابراین «یادآوری
 * سایت» و «یادآوری بله» یک منبع دارند و از هم جدا نمی‌شوند.
 *
 * برای جلوگیری از سیل اعلان، در هر ساعت فقط یک یادآوری برای هر وظیفه/مسئول
 * ساخته می‌شود (کلید یکتای اعلان، اجرای مکرر را idempotent می‌کند).
 */
final class TaskReminders
{
    public const COOLDOWN_MINUTES = 60;

    /** @return array{sent:bool,throttled:bool,reason:?string,recipient:?array,bale_linked:bool} */
    public function send(Task $task, User $actor): array
    {
        $assignee = $task->assignee_id ? User::query()->find($task->assignee_id) : null;

        if (! $assignee) {
            return $this->failed('برای این وظیفه مسئول اجرا تعیین نشده است؛ ابتدا مسئول را مشخص کنید.');
        }

        if (! $assignee->isActive()) {
            return $this->failed('حساب مسئول اجرا فعال نیست؛ یادآوری ارسال نشد.');
        }

        $title = 'یادآوری وظیفه: '.$task->title;
        $message = sprintf(
            '%s در %s یادآوری کرد که وظیفهٔ «%s» را پیش ببرید.%s',
            $actor->name,
            $this->persianDate(now()),
            $task->title,
            $task->deadline ? ' مهلت این وظیفه '.$this->persianDate($task->deadline).' است.' : '',
        );

        $payload = [
            'userId' => (string) $assignee->id,
            'title' => $title,
            'message' => $message,
            'type' => 'reminder',
            'notificationCategory' => 'tasks',
            'linkTaskId' => (string) $task->id,
            'read' => false,
            'timestamp' => now()->toIso8601String(),
            'remindedBy' => ['id' => (string) $actor->id, 'name' => $actor->name],
        ];

        if ($this->recent($task, $assignee)) {
            return [
                'sent' => false,
                'throttled' => true,
                'reason' => 'در یک ساعت گذشته یادآوری برای این وظیفه ارسال شده است؛ برای جلوگیری از اعلان تکراری کمی بعد دوباره تلاش کنید.',
                'recipient' => $this->recipient($assignee),
                'bale_linked' => $this->baleLinked($assignee),
            ];
        }

        $attributes = [
            'domain' => DomainRecord::DOMAIN_NOTIFICATION,
            'user_id' => $assignee->id,
            'title' => $title,
            'payload' => $payload,
        ];

        try {
            if (Schema::hasColumn('domain_records', 'notification_key')) {
                DomainRecord::create([
                    ...$attributes,
                    'notification_key' => $this->key($task, $assignee),
                ]);
            } else {
                DomainRecord::create($attributes);
            }
        } catch (\Illuminate\Database\QueryException) {
            // کلید یکتای اعلان مانع ساخت رکورد تکراری شد؛ همان معنای «همین حالا
            // یادآوری فرستاده شده است» را دارد و خطا نیست.
            return [
                'sent' => false,
                'throttled' => true,
                'reason' => 'همین حالا برای این وظیفه یادآوری ثبت شده است؛ چند دقیقه بعد دوباره تلاش کنید.',
                'recipient' => $this->recipient($assignee),
                'bale_linked' => $this->baleLinked($assignee),
            ];
        }

        return [
            'sent' => true,
            'throttled' => false,
            'reason' => null,
            'recipient' => $this->recipient($assignee),
            'bale_linked' => $this->baleLinked($assignee),
        ];
    }

    /** کلید یکتای یادآوری: هر وظیفه، هر مسئول اجرا، هر ساعت. */
    private function key(Task $task, User $assignee): string
    {
        return hash('sha256', 'task-reminder:'.$task->id.':'.$assignee->id.':'.now()->format('YmdH'));
    }

    /** آیا در بازهٔ خنثی‌سازی برای همین وظیفه و همین کاربر یادآوری ساخته شده است؟ */
    private function recent(Task $task, User $assignee): bool
    {
        $since = now()->subMinutes(self::COOLDOWN_MINUTES);

        try {
            if (Schema::hasColumn('domain_records', 'notification_key')) {
                return DomainRecord::query()
                    ->where('notification_key', $this->key($task, $assignee))
                    ->exists();
            }

            return DomainRecord::query()
                ->where('domain', DomainRecord::DOMAIN_NOTIFICATION)
                ->where('user_id', $assignee->id)
                ->where('created_at', '>=', $since)
                ->get()
                ->contains(function (DomainRecord $record) use ($task): bool {
                    $payload = is_array($record->payload) ? $record->payload : [];

                    return ($payload['type'] ?? null) === 'reminder'
                        && (string) ($payload['linkTaskId'] ?? '') === (string) $task->id;
                });
        } catch (\Throwable) {
            // اگر بررسی ممکن نبود، ارسال متوقف نمی‌شود؛ اعلان تکراری بهتر از نبود یادآوری است.
            return false;
        }
    }

    private function baleLinked(User $assignee): bool
    {
        try {
            return BaleUserLink::query()->where('user_id', $assignee->id)->exists();
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array{id:string,name:string} */
    private function recipient(User $assignee): array
    {
        return ['id' => (string) $assignee->id, 'name' => (string) $assignee->name];
    }

    /** @return array{sent:false,throttled:false,reason:string,recipient:null,bale_linked:false} */
    private function failed(string $reason): array
    {
        return ['sent' => false, 'throttled' => false, 'reason' => $reason, 'recipient' => null, 'bale_linked' => false];
    }

    private function persianDate(\DateTimeInterface $date): string
    {
        $immutable = \Carbon\CarbonImmutable::instance($date);

        try {
            $jalali = app(PersianCalendar::class)->fromGregorian($immutable);
            $formatted = sprintf('%04d/%02d/%02d', $jalali['year'] ?? 0, $jalali['month'] ?? 0, $jalali['day'] ?? 0);
        } catch (\Throwable) {
            $formatted = $immutable->toDateString();
        }

        return strtr($formatted, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']);
    }
}
