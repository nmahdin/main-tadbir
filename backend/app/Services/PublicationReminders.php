<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\User;
use App\Support\Calendar\JalaliDate;
use App\Support\Notifications\NotificationPolicy;
use App\Support\OrganizationTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * یادآوری انتشار محتوا.
 *
 * همان چیزی که برای مهلت وظیفه داریم، برای «انتشار» هم لازم است: پرونده‌ای که
 * تاریخ انتشارش امروز است یا از آن گذشته و هنوز منتشر نشده، باید به ناشر و
 * مدیر محتوا یادآوری شود. مسیر ارسال دقیقاً همان مسیر اعلان‌های سامانه است
 * (کارتابل و زنگ اعلان‌ها) و اگر کاربر ربات بله را وصل کرده باشد، لایهٔ ارسال
 * موجود همان اعلان را به بله هم می‌فرستد.
 *
 * کاملاً idempotent است: کلید یکتای اعلان از «پرونده + تاریخ انتشار» ساخته
 * می‌شود، پس اجرای دوباره در همان روز اعلان تکراری نمی‌سازد. تاریخ انتشار
 * ذخیره‌شده هرگز تغییر نمی‌کند و هیچ وضعیتی هم بازنویسی نمی‌شود.
 */
final class PublicationReminders
{
    /** وضعیت‌هایی که یادآوری انتشار برایشان بی‌معناست. */
    public const SETTLED = ['published', 'archived', 'cancelled', 'suspended'];

    /**
     * @return array{scanned:int, reminders:int, recipients:list<int>}
     */
    public function run(?Carbon $now = null, int $limit = 50): array
    {
        $empty = ['scanned' => 0, 'reminders' => 0, 'recipients' => []];

        if (! Schema::hasColumn('domain_records', 'notification_key')) {
            return $empty;
        }

        // همان کلید سازمانی «یادآوری مهلت‌ها» این یادآوری را هم خاموش می‌کند.
        if (! NotificationPolicy::enabled('deadlineReminders')) {
            return $empty;
        }

        // «امروز» به وقت سازمان، همان مرجعی که بقیهٔ سرویس‌ها می‌خوانند.
        $zone = app(OrganizationTime::class)->zone();
        $today = ($now ? $now->copy()->setTimezone($zone) : Carbon::now($zone))->startOfDay();
        $todayIso = $today->toDateString();
        $tomorrowIso = $today->copy()->addDay()->toDateString();

        $contents = Content::query()
            ->whereNotIn('status', self::SETTLED)
            ->whereNotNull('payload->publishInfo->date')
            ->where('payload->publishInfo->date', '<=', $tomorrowIso)
            ->orderBy('payload->publishInfo->date')
            ->orderBy('id')
            ->limit(max(1, min($limit, 200)))
            ->get();

        $recipients = [];
        $scanned = 0;

        foreach ($contents as $content) {
            $date = $this->publishDate($content);
            if ($date === null || $date > $tomorrowIso) {
                continue;
            }
            $scanned++;
            $time = $this->publishTime($content);
            $overdue = $date < $todayIso;
            $title = $overdue ? 'انتشار عقب‌افتاده' : 'یادآوری انتشار';
            $message = $overdue
                ? sprintf('تاریخ انتشار محتوای «%s» (%s) گذشته است و پرونده هنوز منتشر نشده است.', (string) $content->title, $this->stamp($date, $time))
                : sprintf('محتوای «%s» برای انتشار در %s زمان‌بندی شده است.', (string) $content->title, $this->stamp($date, $time));

            foreach ($this->audience($content) as $recipient) {
                if ($this->remind(
                    'publish:content:'.$content->id.':'.$date.($overdue ? ':overdue' : ':due'),
                    $recipient,
                    $title,
                    $message,
                    array_filter([
                        'linkContentId' => (string) $content->id,
                        'publishDate' => $date,
                        'publishTime' => $time ?: null,
                    ], static fn ($value) => $value !== null),
                    $overdue ? 'overdue' : 'reminder',
                )) {
                    $recipients[] = $recipient->id;
                }
            }
        }

        return ['scanned' => $scanned, 'reminders' => count($recipients), 'recipients' => array_values(array_unique($recipients))];
    }

    /** تاریخ انتشار ثبت‌شده (`YYYY-MM-DD`) یا null. */
    private function publishDate(Content $content): ?string
    {
        $date = $content->payload['publishInfo']['date'] ?? null;
        $date = is_string($date) ? trim(substr($date, 0, 10)) : '';

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null;
    }

    private function publishTime(Content $content): string
    {
        $time = $content->payload['publishInfo']['time'] ?? null;

        return is_string($time) ? trim(substr($time, 0, 5)) : '';
    }

    /**
     * تاریخ و ساعتِ متن اعلان، **شمسی**: «۱۴۰۵/۰۸/۱۱ · ۱۸:۳۰».
     *
     * تاریخ خام میلادی (`2026-11-02`) در متن اعلان دیده نمی‌شود؛ کلید یکتای
     * اعلان همچنان با تاریخ میلادی ساخته می‌شود تا تشخیص تکرار به تقویم وابسته
     * نباشد.
     */
    private function stamp(string $date, string $time): string
    {
        return JalaliDate::shortWithTime($date, $time === '' ? null : $time);
    }

    /**
     * گیرندگان یادآوری، به ترتیب اهمیت:
     *
     * ۱) **مسئول انتشار** (همان `publisherId` که در برنامهٔ انتشار انتخاب شده) —
     *    یادآوری انتشار بدون او بی‌معناست.
     * ۲) مالک پرونده؛ اگر ناشر ثبت نشده باشد، نقش ناشر را عملاً همین شخص دارد.
     * ۳) اگر هیچ‌کدام حساب فعال نداشتند (ناشر غیرفعال شده یا پرونده بدون مالک
     *    مانده)، مدیر دپارتمان همان پرونده؛ تا یادآوری هرگز بی‌گیرنده نماند.
     *
     * @return list<User>
     */
    private function audience(Content $content): array
    {
        $payload = $content->payload ?? [];

        $result = $this->users([$payload['publisherId'] ?? null, $content->owner_id]);
        if ($result !== []) {
            return $result;
        }

        // آخرین ایستگاه: مدیر دپارتمان پرونده، سپس ناشر ذخیره‌شده در «_publication».
        $departmentIds = array_filter([
            $payload['departmentId'] ?? null,
            ...((array) ($payload['departmentIds'] ?? [])),
        ], static fn ($id) => is_scalar($id) && (string) $id !== '');

        $managerIds = Department::query()
            ->whereIn('id', array_map('strval', $departmentIds))
            ->whereNotNull('manager_id')
            ->pluck('manager_id')
            ->all();

        return $this->users([...$managerIds, $payload['_publication']['publisherId'] ?? null]);
    }

    /**
     * شناسه‌های داده‌شده را به کاربران فعال و یکتا تبدیل می‌کند؛ ترتیب ورودی حفظ
     * می‌شود تا «ناشر» همیشه اول فهرست باشد.
     *
     * @param  array<int, mixed>  $ids
     * @return list<User>
     */
    private function users(array $ids): array
    {
        $seen = [];
        $result = [];
        foreach ($ids as $id) {
            // شناسه‌ها در payload گاهی رشته و گاهی عدد ذخیره شده‌اند؛ مقدار غیرعددی
            // (مثل نام دپارتمان در دادهٔ قدیمی) نباید به کوئری کاربر برسد.
            if (! is_scalar($id) || ! preg_match('/^\d+$/', (string) $id)) {
                continue;
            }
            $key = (string) $id;
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $user = User::find((int) $id);
            if ($user?->isActive()) {
                $result[] = $user;
            }
        }

        return $result;
    }

    /**
     * ثبت اعلان درون‌سامانه‌ای با کلید یکتا.
     *
     * @param  array<string, string>  $links
     */
    private function remind(string $subject, User $recipient, string $title, string $message, array $links, string $type): bool
    {
        return DomainRecord::firstOrCreate(
            ['notification_key' => hash('sha256', 'publish:'.$subject.':'.$recipient->id)],
            [
                'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                'user_id' => $recipient->id,
                'title' => $title,
                'payload' => [
                    'userId' => (string) $recipient->id,
                    'title' => $title,
                    'message' => $message,
                    'type' => $type,
                    'notificationCategory' => 'content',
                    'read' => false,
                    'timestamp' => now()->toIso8601String(),
                    ...$links,
                ],
            ],
        )->wasRecentlyCreated;
    }
}
