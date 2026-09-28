<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/** Shared by the panel and Bale; the bot never invents its own workflow. */
final class TaskOperations
{
    public const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'completed', 'archived'];

    public function visibleTo(User $actor): Builder
    {
        $query = Task::query();
        $actor = $actor->fresh();
        if (! $actor?->isActive()) {
            return $query->whereRaw('1 = 0');
        }

        // Match the panel's existing tasks.view gate. Callers further scope their own lists.
        return $actor->hasPermission('tasks.view') ? $query : $query->whereRaw('1 = 0');
    }

    public function allowedStatuses(User $actor, Task $task): array
    {
        $actor = $actor->fresh();
        if (! $actor) {
            return [];
        }
        if (! $actor->isActive() || ((int) $task->assignee_id !== (int) $actor->id && ! $actor->hasPermission('tasks.status'))) {
            return [];
        }

        return self::STATUSES;
    }

    public function changeStatus(User $actor, Task $task, string $status, ?string $expectedStatus = null, string $source = 'web'): Task
    {
        return DB::transaction(function () use ($actor, $task, $status, $expectedStatus, $source): Task {
            $fresh = Task::whereKey($task->id)->lockForUpdate()->firstOrFail();
            $allowed = $this->allowedStatuses($actor, $fresh);
            abort_if($allowed === [], 403, 'اجازه تغییر وضعیت این وظیفه را ندارید.');
            Validator::make(['status' => $status], ['status' => ['required', Rule::in($allowed)]])->validate();
            abort_if($expectedStatus !== null && $fresh->status !== $expectedStatus, 409, 'وضعیت وظیفه تغییر کرده است؛ دوباره آن را باز کنید.');
            if ($fresh->status === $status) {
                return $fresh;
            }
            $before = $fresh->status;
            $fresh->update(['status' => $status]);
            $this->updateProjectProgress($fresh->project_id);
            ActivityLog::create([
                'user_id' => $actor->id, 'task_id' => $fresh->id, 'project_id' => $fresh->project_id,
                'type' => 'status_change', 'action' => 'تغییر وضعیت وظیفه', 'details' => $before.' → '.$status.'; source:'.$source,
            ]);

            return $fresh;
        });
    }

    public function report(User $actor, Task $task, string $text, string $source = 'web'): TaskComment
    {
        return DB::transaction(function () use ($actor, $task, $text, $source): TaskComment {
            $actor = $actor->fresh();
            abort_unless($actor?->isActive(), 403);
            $fresh = $this->visibleTo($actor)->whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $fresh->assignee_id === (int) $actor->id || $actor->hasPermission('tasks.edit'), 403);
            Validator::make(['text' => $text], ['text' => ['required', 'string', 'max:3000']])->validate();
            $comment = TaskComment::create(['task_id' => $fresh->id, 'user_id' => $actor->id, 'text' => $text]);
            ActivityLog::create([
                'user_id' => $actor->id, 'task_id' => $fresh->id, 'project_id' => $fresh->project_id,
                'type' => 'comment', 'action' => 'ثبت گزارش وظیفه', 'details' => 'comment_id:'.$comment->id.'; source:'.$source,
            ]);

            return $comment;
        });
    }

    public function updateProjectProgress(?int $projectId): void
    {
        if (! $projectId || ! ($project = Project::find($projectId))) {
            return;
        }
        $total = $project->tasks()->count();
        $completed = $project->tasks()->where('status', 'completed')->count();
        $project->update(['progress' => $total ? (int) round($completed / $total * 100) : 0]);
    }
}
