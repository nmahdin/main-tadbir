<?php

namespace App\Bot\Bale\Meetings;

use App\Bot\Bale\Notifications\NotificationAccess;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PersianDate;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\Access\UserPermissionGate;
use Illuminate\Database\Eloquent\Builder;

final class MeetingBrowser
{
    public function query(User $user): Builder
    {
        app(UserPermissionGate::class)->authorizeAny($user, 'meetings.view');

        return WorkspaceRecord::where('kind', WorkspaceRecord::KIND_MEETING)->where(fn ($q) => $q
            ->where('owner_id', $user->id)->orWhereJsonContains('payload->attendeeIds', (string) $user->id)->orWhereJsonContains('payload->attendeeIds', (int) $user->id));
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
