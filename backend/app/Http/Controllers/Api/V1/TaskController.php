<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
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
        $task = Task::create($this->attributes($request->validated()));
        $this->updateProjectProgress($task->project_id);

        return (new TaskResource($task->load(['comments', 'attachments', 'activityLogs'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Task $task): TaskResource
    {
        return new TaskResource($task->load(['comments', 'attachments', 'activityLogs']));
    }

    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $oldProjectId = $task->project_id;
        $task->update($this->attributes($request->validated()));
        $this->updateProjectProgress($oldProjectId);
        $this->updateProjectProgress($task->project_id);

        return new TaskResource($task->refresh()->load(['comments', 'attachments', 'activityLogs']));
    }

    public function updateStatus(Request $request, Task $task): TaskResource
    {
        $data = Validator::make($request->all(), [
            'status' => ['required', Rule::in(['backlog', 'todo', 'in_progress', 'review', 'completed'])],
        ])->validate();

        $task->update($data);
        $this->updateProjectProgress($task->project_id);

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
        if (! $projectId) {
            return;
        }

        $project = Project::find($projectId);

        if (! $project) {
            return;
        }

        $total = $project->tasks()->count();
        $completed = $project->tasks()->where('status', 'completed')->count();
        $project->update(['progress' => $total === 0 ? 0 : (int) round(($completed / $total) * 100)]);
    }
}
