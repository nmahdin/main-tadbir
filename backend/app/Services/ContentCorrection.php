<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Task;
use App\Models\User;

/** Called only inside the authorized review transaction holding the content lock. */
final class ContentCorrection
{
    public function create(Content $content, array $stage, array $event, User $actor): Task
    {
        $parent = Task::where('content_id', $content->id)->where('content_stage_id', $stage['id'])
            ->whereIn('kind', ['content_work', 'content_correction'])->latest('id')->first();
        $assignee = User::whereKey($stage['assigneeId'] ?? $parent?->assignee_id)->where('status', 'active')->first();
        $task = Task::firstOrCreate(['source_key' => hash('sha256', 'correction:'.$content->id.':'.$stage['id'].':'.$event['id'])], [
            'content_id' => $content->id, 'content_stage_id' => $stage['id'], 'project_id' => $content->project_id,
            'parent_task_id' => $parent?->id, 'source_event_id' => $event['id'], 'kind' => 'content_correction',
            'title' => mb_substr('اصلاح «'.($stage['title'] ?? 'مرحله').'»: '.$content->title, 0, 255),
            'description' => $event['note'], 'assignee_id' => $assignee?->id,
            'status' => $assignee ? 'todo' : 'backlog', 'priority' => 'high',
            'start_date' => today(), 'deadline' => $stage['deadline'] ?? $content->deadline,
            'tags' => ['محتوا', 'اصلاح'],
        ]);
        if ($task->wasRecentlyCreated) {
            ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
                'type' => 'correction_created', 'action' => 'ایجاد وظیفهٔ اصلاح پس از عودت مرحله',
                'details' => json_encode(['event_id' => $event['id'], 'parent_task_id' => $parent?->id], JSON_UNESCAPED_UNICODE)]);
            app(TaskAssignmentNotifications::class)->created($task);
        }

        return $task;
    }
}
