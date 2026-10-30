<?php

namespace App\Bot\Bale\Meetings;

use App\Bot\Bale\Notifications\NotificationAccess;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PersianDate;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\Access\UserPermissionGate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class MeetingBrowser
{
    public function query(User $user): Builder
    {
        app(UserPermissionGate::class)->authorizeAny($user, 'meetings.view');

        return WorkspaceRecord::where('kind', WorkspaceRecord::KIND_MEETING)->where(fn ($q) => $q
            ->where('owner_id', $user->id)->orWhereJsonContains('payload->attendeeIds', (string) $user->id)->orWhereJsonContains('payload->attendeeIds', (int) $user->id));
    }

    /**
     * Only scheduled, future meetings are shown in "My meetings".
     * Filter before pagination, so completed/past meetings cannot consume
     * page slots and a user cannot see another member's meeting.
     *
     * Dates may be ISO Gregorian or legacy Persian/Jalali; dates without a
     * valid time are included only if they are on a later day.
     *
     * @return Collection<int, WorkspaceRecord>
     */
    public function upcoming(User $user): Collection
    {
        $clock = now((string) config('bale.meeting_timezone', 'Asia/Tehran'));
        $today = $clock->format('Y-m-d');
        $nowTime = $clock->format('H:i');

        return $this->query($user)
            ->where('status', 'scheduled')
            ->get()
            ->filter(function (WorkspaceRecord $meeting) use ($today, $nowTime): bool {
                $start = $this->startOf($meeting);
                if (! $start) {
                    return false;
                }
                return $start[0] > $today || ($start[0] === $today && $start[1] !== null && $start[1] > $nowTime);
            })
            ->sortBy(function (WorkspaceRecord $meeting): string {
                [$date, $time] = $this->startOf($meeting);
                return $date.' '.($time ?? '00:00').sprintf(' %018d', $meeting->id);
            })
            ->values();
    }

    /** @return array{string, ?string}|null */
    private function startOf(WorkspaceRecord $meeting): ?array
    {
        $payload = $meeting->payload ?? [];
        $dateText = $payload['date'] ?? null;
        if (! is_string($dateText)) {
            return null;
        }
        try {
            $date = PersianDate::iso($dateText);
        } catch (\Throwable) {
            return null;
        }
        if ($date === null) {
            return null;
        }

        $time = trim((string) ($payload['time'] ?? ''));
        $time = strtr($time, [
            '۰'=>'0', '۱'=>'1', '۲'=>'2', '۳'=>'3', '۴'=>'4', '۵'=>'5',
            '۶'=>'6', '۷'=>'7', '۸'=>'8', '۹'=>'9',
            '٠'=>'0', '١'=>'1', '٢'=>'2', '٣'=>'3', '٤'=>'4',
            '٥'=>'5', '٦'=>'6', '٧'=>'7', '٨'=>'8', '٩'=>'9',
        ]);
        if (! preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/D', $time, $match)) {
            return [$date, null];
        }

        return [$date, sprintf('%02d:%02d', (int) $match[1], (int) $match[2])];
    }

    public function detail(User $user, int $id): WorkspaceRecord
    {
        $meeting = WorkspaceRecord::find($id);
        abort_unless($meeting && app(NotificationAccess::class)->meetingMember($user, $meeting), 403);

        return $meeting;
    }

    public function text(WorkspaceRecord $meeting): string
    {
        $p = $meeting->payload ?? [];
        $status = ['scheduled' => 'برنامه‌ریزی‌شده', 'in_progress' => 'در حال برگزاری', 'completed' => 'پایان‌یافته', 'cancelled' => 'لغوشده'][$meeting->status] ?? 'نامشخص';
        $body = '📅 *'.MessageText::plain($meeting->title, 220)."* \n\n";
        $body .= '🗓 تاریخ: '.PersianDate::format($p['date'] ?? null)."\n🕒 ساعت: ".MessageText::plain(PersianDate::digits($p['time'] ?? 'نامشخص'), 30);
        $body .= "\n⏱ مدت: ".MessageText::plain(PersianDate::digits($p['duration'] ?? 'نامشخص'), 80)."\n📍 محل: ".MessageText::plain($p['locationDetails'] ?? 'نامشخص', 300);
        $body .= "\n👤 برگزارکننده: ".MessageText::plain($meeting->owner?->name ?? 'نامشخص', 100)."\n🏷 وضعیت: ".$status;
        if (! empty($p['description'])) {
            $body .= "\n\n📝 *توضیحات* \n".MessageText::plain($p['description'], 900);
        }
        $items = array_slice((array) ($p['agenda'] ?? []), 0, 8);
        if ($items) {
            $body .= "\n\n📋 *دستور جلسه* ";
            foreach ($items as $item) {
                if (is_array($item)) {
                    $body .= "\n• ".MessageText::plain((string) ($item['title'] ?? ''), 120);
                }
            }
        }

        return $body;
    }
}
