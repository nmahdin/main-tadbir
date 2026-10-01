<?php

namespace App\Bot\Bale\Support;

use App\Models\DomainRecord;
use App\Models\Task;

final class NotificationText
{
    public static function render(DomainRecord $record): string
    {
        $p = $record->payload ?? [];
        $icon = match ($p['type'] ?? '') {
            'assignment' => '📌', 'deadline', 'overdue' => '⏰', 'comment', 'mention' => '💬', 'status_change' => '🔄', default => '🔔',
        };
        if (! empty($p['linkMeetingId'])) {
            $icon = '📅';
        }
        $body = $icon.' *'.MessageText::plain($record->title ?? '', 220)."* \n\n".MessageText::plain((string) ($p['message'] ?? ''), 2800);
        if (! empty($p['linkTaskId']) && ($task = Task::find($p['linkTaskId']))) {
            $body .= "\n\n📅 مهلت: ".PersianDate::format($task->deadline);
        }

        return $body."\n\n──────────\nتدبیر · اعلان‌های شما";
    }
}
