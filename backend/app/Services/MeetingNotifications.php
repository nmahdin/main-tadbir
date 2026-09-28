<?php

namespace App\Services;

use App\Bot\Bale\Notifications\NotificationAccess;
use App\Bot\Bale\Support\PersianDate;
use App\Models\DomainRecord;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Facades\Schema;

final class MeetingNotifications
{
    public function created(WorkspaceRecord $meeting): void
    {
        $p = $meeting->payload ?? [];
        $ids = array_unique([$meeting->owner_id, ...($p['attendeeIds'] ?? [])]);
        foreach (User::whereIn('id', $ids)->get() as $user) {
            if (! app(NotificationAccess::class)->meetingMember($user, $meeting)) {
                continue;
            }
            $title = 'جلسه جدید';
            $attributes = ['domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $user->id, 'title' => $title,
                'payload' => ['userId' => (string) $user->id, 'title' => $title, 'type' => 'system', 'read' => false,
                    'linkMeetingId' => (string) $meeting->id, 'timestamp' => now()->toIso8601String(),
                    'message' => '📅 '.$meeting->title."\n🗓 ".PersianDate::format($p['date'] ?? null)."\n🕒 ".($p['time'] ?? 'تعیین نشده')."\n📍 ".($p['locationDetails'] ?? 'تعیین نشده')]];
            if (Schema::hasColumn('domain_records', 'notification_key')) {
                DomainRecord::firstOrCreate(['notification_key' => hash('sha256', 'meeting-created:'.$meeting->id.':'.$user->id)], $attributes);
            } else {
                DomainRecord::create($attributes);
            }
        }
    }
}
