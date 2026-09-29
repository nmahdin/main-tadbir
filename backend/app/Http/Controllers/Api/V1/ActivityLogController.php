<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Validator;

class ActivityLogController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->hasPermission('reports.view'), 403);
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,100'], 'user_id' => ['sometimes', 'integer', 'min:1']]);
        $logs = ActivityLog::query()
            ->when(! $request->user()->hasPermission('tasks.view'), fn ($q) => $q->whereNull('task_id'))
            ->when(! $request->user()->hasPermission('projects.view'), fn ($q) => $q->whereNull('project_id'))
            ->with(['user', 'task', 'project'])
            ->when($request->integer('user_id'), fn ($query, int $id) => $query->where('user_id', $id))
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return ActivityLogResource::collection($logs);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Validator::make($request->all(), [
            'action' => ['required', 'string', 'max:500'],
            'type' => ['sometimes', 'nullable', 'string', 'max:80'],
            'details' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'taskId' => ['sometimes', 'nullable', 'integer', 'exists:tasks,id'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
        ])->validate();

        abort_if(isset($data['taskId']) && ! $request->user()->hasPermission('tasks.view'), 403);
        abort_if(isset($data['projectId']) && ! $request->user()->hasPermission('projects.view'), 403);
        $log = ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => $data['action'],
            'type' => 'client_note', // A client statement is never an authoritative operation event.
            'details' => $data['details'] ?? null,
            'task_id' => is_numeric($data['taskId'] ?? null) ? (int) $data['taskId'] : null,
            'project_id' => is_numeric($data['projectId'] ?? null) ? (int) $data['projectId'] : null,
        ]);

        return (new ActivityLogResource($log->load(['user', 'task', 'project'])))
            ->response()
            ->setStatusCode(201);
    }
}
