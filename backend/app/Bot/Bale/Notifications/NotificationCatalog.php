<?php

namespace App\Bot\Bale\Notifications;

use App\Models\BaleUserLink;
use App\Models\DomainRecord;

final class NotificationCatalog
{
    /**
     * Categories are intentionally stable API identifiers. Notification types
     * explain the events grouped under each user-facing preference.
     */
    public const CATEGORIES = [
        'tasks' => [
            'label' => 'وظایف و مهلت‌ها',
            'description' => 'واگذاری وظیفه، تغییر وضعیت، نزدیک‌شدن مهلت و تأخیر',
            'types' => ['واگذاری وظیفه', 'تغییر وضعیت', 'نزدیک‌شدن مهلت', 'تأخیر'],
        ],
        'content' => [
            'label' => 'محتوا و انتشار',
            'description' => 'ارجاع مرحله، درخواست ارزیابی، اصلاح و انتشار محتوا',
            'types' => ['ارجاع مرحله محتوا', 'درخواست ارزیابی', 'درخواست اصلاح', 'انتشار'],
        ],
        'meetings' => [
            'label' => 'جلسه‌ها و اتاق فکر',
            'description' => 'دعوت جلسه، یادآوری، صورت‌جلسه و رویدادهای ایده‌ها',
            'types' => ['دعوت جلسه', 'یادآوری جلسه', 'ثبت صورت‌جلسه', 'تغییر ایده'],
        ],
        'secretariat' => [
            'label' => 'دبیرخانه و ارجاع‌ها',
            'description' => 'نامه، ارجاع، مصوبه و مهلت اقدام اداری',
            'types' => ['ارجاع نامه', 'مصوبه', 'مهلت اقدام اداری'],
        ],
        'collaboration' => [
            'label' => 'دیدگاه و اشاره',
            'description' => 'پاسخ به دیدگاه، اشاره به شما و فعالیت‌های همکاری',
            'types' => ['دیدگاه', 'اشاره به شما', 'پاسخ'],
        ],
        'system' => [
            'label' => 'سامانه و امنیت',
            'description' => 'پیام‌های ضروری سامانه، امنیت حساب و اطلاع‌رسانی عمومی',
            'types' => ['پیام سامانه', 'امنیت حساب', 'اطلاع‌رسانی عمومی'],
        ],
    ];

    /** @return array<int, string> */
    public function all(): array
    {
        return array_keys(self::CATEGORIES);
    }

    /** @return array<string, array{label:string,description:string,types:array<int,string>}> */
    public function publicCatalog(): array
    {
        return self::CATEGORIES;
    }

    public function category(DomainRecord $record): string
    {
        $payload = $record->payload ?? [];
        $explicit = (string) ($payload['notificationCategory'] ?? '');
        if (array_key_exists($explicit, self::CATEGORIES)) {
            return $explicit;
        }
        if (! empty($payload['linkTaskId'])) return 'tasks';
        if (! empty($payload['linkContentId'])) return 'content';
        if (! empty($payload['linkMeetingId']) || ! empty($payload['linkIdeaId'])) return 'meetings';
        if (! empty($payload['linkLetterId']) || ! empty($payload['linkResolutionId'])) return 'secretariat';
        if (in_array((string) ($payload['type'] ?? ''), ['comment', 'mention', 'reply'], true)) return 'collaboration';

        return 'system';
    }

    /** @return array<int, string> */
    public function enabledFor(BaleUserLink $link): array
    {
        $preferences = $link->notification_preferences;
        if (! is_array($preferences) || ! isset($preferences['enabled_categories']) || ! is_array($preferences['enabled_categories'])) {
            return $this->all();
        }

        return array_values(array_intersect($this->all(), array_map('strval', $preferences['enabled_categories'])));
    }

    public function allows(BaleUserLink $link, DomainRecord $record): bool
    {
        return in_array($this->category($record), $this->enabledFor($link), true);
    }
}
