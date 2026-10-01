<?php

namespace App\Services;

use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/** A persisted task, not a client-side temporary ID, is the source of assignment notifications. */
final class TaskAssignmentNotifications
{
    public function created(Task $task): ?DomainRecord
    {
        $recipient = User::find($task->assignee_id);
        if (! $recipient?->isActive()) {
            return null;
        }
        $attributes = [
            'domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $recipient->id,
            'title' => 'وظیفهٔ جدید',
            'payload' => ['userId' => (string) $recipient->id, 'title' => 'وظیفهٔ جدید',
                'message' => 'وظیفهٔ «'.$task->title.'» به شما واگذار شد.', 'type' => 'assignment', 'notificationCategory' => 'tasks',
                'linkTaskId' => (string) $task->id, 'read' => false, 'timestamp' => now()->toIso8601String()],
        ];
        // Preserve internal notifications on older installations as well.
        if (! Schema::hasColumn('domain_records', 'notification_key')) {
            return DomainRecord::create($attributes);
        }

        return DomainRecord::firstOrCreate(['notification_key' => hash('sha256', 'task-created:'.$task->id.':'.$recipient->id)], $attributes);
    }
}
