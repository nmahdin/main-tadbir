<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Task;
use App\Models\User;

/** Called only inside the authorized review transaction holding the content lock. */
final class ContentCorrection
{
    /**
     * One correction task per review cycle. The idempotency key is derived from
     * the review task that is being closed, not from the freshly generated
     * decision event, so an HTTP retry of the same rejection can never open a
     * second correction task for the same cycle.
     */
    public function create(Content $content, array $stage, array $event, User $actor, ?Task $reviewTask = null): Task
    {
        $parent = Task::where('content_id', $content->id)->where('content_stage_id', $stage['id'])
            ->whereIn('kind', ['content_work', 'content_correction'])->latest('id')->first();
        $assignee = User::whereKey($stage['assigneeId'] ?? $parent?->assignee_id)->where('status', 'active')->first();
        $cycle = $reviewTask?->id !== null
            ? 'review:'.$reviewTask->id
            : 'event:'.($event['id'] ?? '');
        $task = Task::firstOrCreate(['source_key' => hash('sha256', 'correction:'.$content->id.':'.$stage['id'].':'.$cycle)], [
            'content_id' => $content->id, 'content_stage_id' => $stage['id'], 'project_id' => $content->project_id,
            'parent_task_id' => $parent?->id, 'source_event_id' => $event['id'], 'kind' => 'content_correction',
            'title' => mb_substr('اصلاح «'.($stage['title'] ?? 'مرحله').'»: '.$content->title, 0, 255),
            'description' => $event['note'], 'assignee_id' => $assignee?->id,
            'status' => 'backlog', 'priority' => 'high',
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
