<?php

namespace App\Services;

use App\Events\ContentPublished;
use App\Models\ActivityLog;
use App\Models\Content;
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

    public function ownForBale(User $actor, int|string $id): Task
    {
        $task = $this->visibleTo($actor)->whereKey($id)->where('assignee_id', $actor->id)->first();
        abort_unless($task, 404);

        return $task;
    }

    public function allowedStatuses(User $actor, Task $task): array
    {
        $actor = $actor->fresh();
        if (! $actor) {
            return [];
        }
        if (! $actor->isActive() || ! $actor->hasPermission('tasks.view') || ((int) $task->assignee_id !== (int) $actor->id && ! $actor->hasPermission('tasks.status'))) {
            return [];
        }

        return self::STATUSES;
    }

    public function changeStatus(User $actor, Task $task, string $status, ?string $expectedStatus = null, string $source = 'web'): Task
    {
        return DB::transaction(function () use ($actor, $task, $status, $expectedStatus, $source): Task {
            $fresh = Task::whereKey($task->id)->lockForUpdate()->firstOrFail();
            if ($source === 'bale') {
                abort_unless((int) $fresh->assignee_id === (int) $actor->id && ! $fresh->content_id && in_array($fresh->kind, [null, 'general'], true), 403);
            }
            $allowed = $this->allowedStatuses($actor, $fresh);
            abort_if($allowed === [], 403, 'اجازه تغییر وضعیت این وظیفه را ندارید.');
            abort_if($fresh->kind === 'content_review' && $fresh->status !== $status, 422, 'تصمیم بررسی باید از مرحلهٔ محتوا ثبت شود.');
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

    public function editVersion(Task $task): string
    {
        return hash('sha256', json_encode($task->only(['title', 'description', 'deadline', 'priority', 'status', 'assignee_id', 'content_id', 'kind', 'updated_at'])));
    }

    public function editable(User $actor, Task $task): bool
    {
        return $actor->isActive() && $actor->hasPermission('tasks.view') && $actor->hasPermission('tasks.edit')
            && ! $task->content_id && in_array($task->kind, [null, 'general'], true);
    }

    public function detailRules(Task $task): array
    {
        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'deadline' => ['sometimes', 'nullable', 'date_format:Y-m-d', ...($task->start_date ? ['after_or_equal:'.$task->start_date->toDateString()] : [])],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
        ];
    }

    public function editDetails(User $actor, Task $task, array $data, ?string $version = null, string $source = 'web'): Task
    {
        return DB::transaction(function () use ($actor, $task, $data, $version, $source) {
            $actor = $actor->fresh();
            $task = Task::whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor && $this->editable($actor, $task), 403);
            if ($source === 'bale') {
                abort_unless((int) $task->assignee_id === (int) $actor->id, 403);
            }
            abort_if($version !== null && ! hash_equals($this->editVersion($task), $version), 409, 'وظیفه تغییر کرده است؛ دوباره آن را باز کنید.');
            abort_if(array_diff(array_keys($data), array_keys($this->detailRules($task))) !== [], 422);
            $data = Validator::make($data, $this->detailRules($task))->validate();
            $task->fill($data);
            if ($task->isDirty()) {
                $task->save();
                ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
                    'type' => 'task_edited', 'action' => 'ویرایش مشخصات وظیفه', 'details' => 'source:'.$source]);
            }

            return $task;
        });
    }

    /** Authorize the actual field changes, not an OR of endpoint permissions. */
    public function updateFields(User $actor, Task $task, array $attributes): Task
    {
        return DB::transaction(function () use ($actor, $task, $attributes): Task {
            $actor = $actor->fresh();
            abort_unless($actor?->isActive() && $actor->hasPermission('tasks.view'), 403);
            $task = Task::whereKey($task->id)->lockForUpdate()->firstOrFail();
            $oldProjectId = $task->project_id;
            $candidate = clone $task;
            $candidate->fill($attributes);
            $changes = $candidate->getDirty();
            if (isset($changes['content_id'])) {
                $content = Content::findOrFail($changes['content_id']);
                abort_unless(app(ContentAccess::class)->canView($actor, $content), 403);
            }
            if (isset($changes['project_id'])) {
                abort_unless($actor->hasPermission('projects.view'), 403);
            }
            if (isset($changes['kind']) && $changes['kind'] !== 'general') {
                abort(422, 'نوع وابسته به گردش کار فقط در منبع تعیین می‌شود.');
            }
            if (in_array($task->kind, ['content_work', 'content_review'], true)) {
                abort_if(array_intersect(array_keys($changes), ['title', 'description', 'deadline', 'start_date', 'priority']), 422, 'این مشخصات از مرحلهٔ محتوا گرفته می‌شوند؛ منبع را ویرایش کنید.');
            }

            if ($task->kind === ContentPublication::KIND || ($attributes['kind'] ?? null) === ContentPublication::KIND) {
                abort_if(array_intersect(array_keys($changes), ['kind', 'content_id', 'content_stage_id', 'project_id']), 422, 'اتصال تسک انتشار از ویرایش عمومی تغییر نمی‌کند.');
            }
            if (in_array($task->kind, ['content_work', 'content_review', 'content_correction'], true) || in_array($attributes['kind'] ?? null, ['content_review', 'content_correction'], true)) {
                abort_if(array_intersect(array_keys($changes), ['kind', 'content_id', 'content_stage_id', 'assignee_id', 'project_id']), 422, 'ارجاع بررسی را از محتوای مرتبط تغییر دهید.');
            }
            foreach (array_keys($changes) as $field) {
                $permission = match ($field) {
                    'status' => 'tasks.status',
                    'assignee_id' => 'tasks.assign',
                    default => 'tasks.edit',
                };
                // Own execution progress is distinct from editing/assignment; evaluate
                // against the stored assignee (never the incoming assignment).
                $ownStatus = in_array($field, ['status', 'subtasks', 'logged_hours'], true) && (int) $task->assignee_id === (int) $actor->id;
                abort_unless($ownStatus || $actor->hasPermission($permission), 403, 'مجوز تغییر این بخش از وظیفه را ندارید.');
            }
            if (array_key_exists('status', $changes)) {
                $task = $this->changeStatus($actor, $task, $changes['status']);
                unset($changes['status']);
            }
            // getDirty() contains storage-encoded JSON; write original typed values.
            $task->update(array_intersect_key($attributes, $changes));
            if ($changes !== []) {
                ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
                    'type' => 'task_edited', 'action' => 'ویرایش وظیفه', 'details' => 'fields:'.implode(',', array_keys($changes))]);
            }
            $this->updateProjectProgress($oldProjectId);
            $this->updateProjectProgress($task->project_id);

            return $task;
        });
    }

    /** Internal rule effect, never selected by an HTTP source parameter. */
    public function completeAfterPublication(User $actor, Task $task, ContentPublished $event): void
    {
        // Caller holds content then task locks inside the publication transaction.
        abort_unless(DB::transactionLevel() > 0 && (int) $task->content_id === $event->contentId, 409);
        $before = $task->status;
        $task->update(['status' => 'completed']);
        $this->updateProjectProgress($task->project_id);
        ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
            'type' => 'automatic_status_change', 'action' => 'این تسک پس از ثبت انتشار محتوا در تدبیر تکمیل شد.',
            'details' => json_encode(['source' => 'automation', 'event' => 'content.published', 'event_id' => $event->eventId,
                'content_id' => $event->contentId, 'task_id' => $task->id, 'from' => $before, 'to' => 'completed',
                'external_delivery' => false], JSON_UNESCAPED_UNICODE)]);
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
