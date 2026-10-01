<?php

namespace App\Services;

use App\Bot\Bale\Support\PersianDate;
use App\Models\ActivityLog;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

final class MeetingActionTasks
{
    public function convert(User $actor, WorkspaceRecord $meeting, string $actionId, ?int $projectId): array
    {
        return DB::transaction(function () use ($actor, $meeting, $actionId, $projectId) {
            $actor = $actor->fresh();
            abort_unless($actor?->isActive() && $actor->hasPermission('meetings.minutes') && $actor->hasPermission('tasks.create') && $actor->hasPermission('tasks.view'), 403);
            $meeting = WorkspaceRecord::whereKey($meeting->id)->lockForUpdate()->firstOrFail();
            abort_unless($meeting->kind === WorkspaceRecord::KIND_MEETING && (int) $meeting->owner_id === (int) $actor->id, 403);
            $payload = $meeting->payload ?? [];
            $items = $payload['actionItems'] ?? [];
            $index = collect($items)->search(fn ($item) => is_array($item) && (string) ($item['id'] ?? '') === $actionId);
            abort_if($index === false, 404, 'اقدام جلسه پیدا نشد.');
            $item = $items[$index];
            if (! empty($item['convertedTaskId'])) {
                $task = app(TaskOperations::class)->visibleTo($actor)->whereKey($item['convertedTaskId'])->first();
                abort_unless($task, 409, 'تسک مرتبط حذف شده یا در دسترس نیست؛ ابتدا ارتباط اقدام را بررسی کنید.');

                return [$task, $meeting];
            }
            $data = Validator::make(['title' => $item['title'] ?? null, 'assignee_id' => $item['assigneeId'] ?? null,
                'deadline' => PersianDate::iso($item['deadline'] ?? null), 'project_id' => $projectId], [
                    'title' => 'required|string|max:255', 'assignee_id' => 'required|integer|exists:users,id',
                    'deadline' => 'nullable|date_format:Y-m-d', 'project_id' => 'nullable|integer|exists:projects,id',
                ])->validate();
            abort_unless(User::find($data['assignee_id'])?->isActive(), 422, 'مسئول اقدام باید حساب فعال داشته باشد.');
            if ($projectId) {
                abort_unless($actor->hasPermission('projects.view'), 403);
            }
            $task = Task::create([...$data, 'description' => 'اقدام مصوب جلسه: '.$meeting->title,
                'kind' => 'general', 'status' => 'todo', 'priority' => 'high', 'tags' => ['مصوبه جلسه']]);
            $items[$index] = [...$item, 'status' => 'converted', 'convertedTaskId' => (string) $task->id];
            $meeting->update(['payload' => [...$payload, 'actionItems' => $items]]);
            app(TaskOperations::class)->updateProjectProgress($projectId);
            app(TaskAssignmentNotifications::class)->created($task);
            ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $projectId, 'type' => 'task_created', 'action' => 'تبدیل اقدام جلسه به وظیفه', 'details' => 'meeting:'.$meeting->id]);

            return [$task, $meeting];
        });
    }
}
