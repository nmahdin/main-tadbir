<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\TaskAssignmentNotifications;
use App\Services\TaskOperations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $tasks = Task::query()
            ->with(['comments', 'attachments', 'activityLogs'])
            ->when($request->integer('project_id'), fn ($query, int $id) => $query->where('project_id', $id))
            ->when($request->integer('assignee_id'), fn ($query, int $id) => $query->where('assignee_id', $id))
            ->when($request->string('status')->toString(), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return TaskResource::collection($tasks);
    }

    public function store(TaskRequest $request): JsonResponse
    {
        abort_unless($request->user()->fresh()?->isActive(), 403);
        $task = DB::transaction(function () use ($request) {
            $task = Task::create($this->attributes($request->validated()));
            $this->updateProjectProgress($task->project_id);
            app(TaskAssignmentNotifications::class)->created($task);

            return $task;
        });

        return (new TaskResource($task->load(['comments', 'attachments', 'activityLogs'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Task $task): TaskResource
    {
        // A deep link is navigation, never a grant. Reuse the panel's current visibility gate.
        abort_unless(app(TaskOperations::class)->visibleTo($request->user())->whereKey($task->id)->exists(), 403);

        return new TaskResource($task->load(['comments', 'attachments', 'activityLogs']));
    }

    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $oldProjectId = $task->project_id;
        $attributes = $this->attributes($request->validated());
        if ($attributes && array_diff(array_keys($attributes), ['title', 'description', 'deadline', 'priority']) === [] && ! $task->content_id && in_array($task->kind, [null, 'general'], true)) {
            app(TaskOperations::class)->editDetails($request->user(), $task, $attributes);
        } else {
            $task->update($attributes);
        }
        $this->updateProjectProgress($oldProjectId);
        $this->updateProjectProgress($task->project_id);

        return new TaskResource($task->refresh()->load(['comments', 'attachments', 'activityLogs']));
    }

    public function updateStatus(Request $request, Task $task): TaskResource
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(TaskOperations::STATUSES)],
            'expected_status' => ['sometimes', 'string'],
        ]);
        $task = app(TaskOperations::class)->changeStatus(
            $request->user(), $task, $data['status'], $data['expected_status'] ?? null,
        );

        return new TaskResource($task->refresh()->load(['comments', 'attachments', 'activityLogs']));
    }

    public function destroy(Task $task): Response
    {
        $projectId = $task->project_id;
        $task->delete();
        $this->updateProjectProgress($projectId);

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        $map = [
            'projectId' => 'project_id',
            'contentId' => 'content_id',
            'contentStageId' => 'content_stage_id',
            'assigneeId' => 'assignee_id',
            'startDate' => 'start_date',
            'estimatedHours' => 'estimated_hours',
            'loggedHours' => 'logged_hours',
            'isBlocked' => 'is_blocked',
            'blockedReason' => 'blocked_reason',
        ];

        $attributes = Arr::except($data, ['subtasks', 'comments', 'attachments', 'activityHistory']);

        foreach ($map as $frontend => $database) {
            if (array_key_exists($frontend, $attributes)) {
                $attributes[$database] = $attributes[$frontend];
                unset($attributes[$frontend]);
            }
        }

        return $attributes;
    }

    private function updateProjectProgress(?int $projectId): void
    {
        app(TaskOperations::class)->updateProjectProgress($projectId);
    }
}
