<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Http\Resources\ActivityLogResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Validator;

class ActivityLogController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $logs = ActivityLog::query()
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
            'taskId' => ['sometimes', 'nullable'],
            'projectId' => ['sometimes', 'nullable'],
        ])->validate();

        $log = ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => $data['action'],
            'type' => $data['type'] ?? 'status_change',
            'details' => $data['details'] ?? null,
            'task_id' => is_numeric($data['taskId'] ?? null) ? (int) $data['taskId'] : null,
            'project_id' => is_numeric($data['projectId'] ?? null) ? (int) $data['projectId'] : null,
        ]);

        return (new ActivityLogResource($log->load(['user', 'task', 'project'])))
            ->response()
            ->setStatusCode(201);
    }
}
