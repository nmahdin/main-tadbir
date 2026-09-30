<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\TaskRequest;
use App\Http\Requests\WorkspaceListRequest;
use App\Http\Resources\TaskResource;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Task;
use App\Services\ContentAccess;
use App\Services\ContentPublication;
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
    public function index(WorkspaceListRequest $request): AnonymousResourceCollection
    {
        // List rows intentionally exclude comments, files and history. Those
        // relations are loaded only by show(); eager-loading them for every row
        // made task navigation grow with the complete audit history.
        $tasks = Task::query()
            ->when($request->input('assignee') === 'me', fn ($query) => $query->where('assignee_id', $request->user()->id))
            ->when($request->filled('due'), fn ($query) => $query->whereNotIn('status', ['completed', 'archived'])
                ->whereDate('deadline', $request->input('due') === 'today' ? '=' : '<', today()->toDateString()))
            ->when($request->filled('priority'), fn ($query) => $query->where('priority', $request->input('priority')))
            ->when($request->integer('content_id'), fn ($query, int $id) => $query->where('content_id', $id))
            ->when($request->integer('project_id'), fn ($query, int $id) => $query->where('project_id', $id))
            ->when($request->integer('assignee_id'), fn ($query, int $id) => $query->where('assignee_id', $id))
            ->when($request->filled('status'), fn ($query) => $request->input('status') === 'open'
                ? $query->whereNotIn('status', ['completed', 'cancelled', 'archived']) : $query->where('status', $request->input('status')))
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%");
                });
            })
            ->orderBy($request->input('sort', 'created_at'), $request->input('direction', 'desc'))
            ->orderBy('id', $request->input('direction', 'desc'))
            ->paginate($request->integer('per_page', 20))->withQueryString();

        return TaskResource::collection($tasks);
    }

    public function store(TaskRequest $request): JsonResponse
    {
        abort_unless($request->user()->fresh()?->isActive(), 403);
        abort_if(in_array($request->input('kind'), [ContentPublication::KIND, 'content_review', 'content_correction', 'content_work'], true), 422, 'تسک وابسته به گردش کار را از صفحهٔ محتوای مربوط بسازید.');
        $task = DB::transaction(function () use ($request) {
            if ($request->filled('contentId')) {
                $source = Content::findOrFail($request->integer('contentId'));
                abort_unless(app(ContentAccess::class)->canView($request->user(), $source), 403);
            }
            if ($request->filled('projectId')) {
                abort_unless($request->user()->hasPermission('projects.view'), 403);
            }
            $task = Task::create($this->attributes($request->validated()));
            $this->updateProjectProgress($task->project_id);
            app(TaskAssignmentNotifications::class)->created($task);

            return $task;
        });

        return (new TaskResource($task->load(['comments.user', 'attachments', 'activityLogs'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Task $task): TaskResource
    {
        // A deep link is navigation, never a grant. Reuse the panel's current visibility gate.
        abort_unless(app(TaskOperations::class)->visibleTo($request->user())->whereKey($task->id)->exists(), 403);

        return new TaskResource($task->load(['comments.user', 'attachments', 'activityLogs']));
    }

    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $task = app(TaskOperations::class)->updateFields(
            $request->user(), $task, $this->attributes($request->validated()),
        );

        return new TaskResource($task->refresh()->load(['comments.user', 'attachments', 'activityLogs']));
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

        return new TaskResource($task->refresh()->load(['comments.user', 'attachments', 'activityLogs']));
    }

    public function comment(Request $request, Task $task): TaskResource
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:3000']]);
        app(TaskOperations::class)->report($request->user(), $task, $data['text']);

        return new TaskResource($task->refresh()->load(['comments.user', 'attachments', 'activityLogs']));
    }

    public function removeAttachment(Request $request, Task $task, string $attachment): TaskResource
    {
        DB::transaction(function () use ($request, $task, $attachment): void {
            $actor = $request->user()->fresh();
            $task = app(TaskOperations::class)->visibleTo($actor)->whereKey($task->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $task->assignee_id === (int) $actor->id || $actor->hasPermission('tasks.edit'), 403);
            $record = $task->attachments()->whereKey($attachment)->firstOrFail();
            $record->delete(); // Unlink only; never delete a shared DAM file by its URL.
            ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
                'type' => 'attachment', 'action' => 'حذف پیوست وظیفه', 'details' => 'attachment_id:'.$record->id]);
        });

        return new TaskResource($task->refresh()->load(['comments.user', 'attachments', 'activityLogs']));
    }

    public function destroy(Task $task): Response
    {
        abort_if($task->kind === 'content_review', 422, 'ارجاع بررسی را نمی‌توان مستقل از محتوا حذف کرد.');
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

        $attributes = Arr::except($data, ['comments', 'attachments', 'activityHistory']);

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
