<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Http\Resources\DepartmentResource;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\TaskResource;
use App\Models\Content;
use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DepartmentDashboardController extends Controller
{
    public function __invoke(Request $request, Department $department): JsonResponse
    {
        $actor = $request->user();
        abort_unless(
            $actor->isAdmin()
                || $actor->hasPermission('departments.view')
                || (int) $department->manager_id === (int) $actor->id,
            403,
            'این داشبورد فقط برای مدیر دپارتمان و مدیران سامانه قابل مشاهده است.',
        );

        $department->load(['users:id,name', 'members:id,name']);
        $memberIds = $department->users->merge($department->members)->pluck('id')
            ->push($department->manager_id)->filter()->unique()->map(fn ($id) => (int) $id)->values();
        $departmentIds = [(string) $department->id, (int) $department->id];

        $contents = Content::query()
            ->where(function (Builder $query) use ($departmentIds, $memberIds): void {
                foreach ($departmentIds as $departmentId) {
                    $query->orWhere('payload->departmentId', $departmentId)
                        ->orWhereJsonContains('payload->departmentIds', $departmentId);
                }
                $query->orWhereIn('owner_id', $memberIds);
            })
            ->latest()->limit(200)->get();

        $contentProjectIds = $contents->pluck('project_id')->filter()->map(fn ($id) => (int) $id)->unique()->values();
        $projects = Project::query()->with('members:id,name')
            ->where(function (Builder $query) use ($memberIds, $contentProjectIds): void {
                $query->whereIn('project_manager_id', $memberIds)
                    ->orWhereHas('members', fn (Builder $members) => $members->whereIn('users.id', $memberIds));
                if ($contentProjectIds->isNotEmpty()) {
                    $query->orWhereIn('id', $contentProjectIds);
                }
            })
            ->latest()->limit(200)->get();

        $projectIds = $projects->pluck('id')->map(fn ($id) => (int) $id)->values();
        $contentIds = $contents->pluck('id')->map(fn ($id) => (int) $id)->values();
        $tasks = Task::query()->with(['comments.user', 'attachments', 'activityLogs'])
            ->where(function (Builder $query) use ($memberIds, $projectIds, $contentIds): void {
                $query->whereIn('assignee_id', $memberIds);
                if ($projectIds->isNotEmpty()) {
                    $query->orWhereIn('project_id', $projectIds);
                }
                if ($contentIds->isNotEmpty()) {
                    $query->orWhereIn('content_id', $contentIds);
                }
            })
            ->latest()->limit(300)->get();

        return response()->json(['data' => [
            'department' => (new DepartmentResource($department))->resolve($request),
            'members' => $department->users->merge($department->members)->unique('id')->map(fn ($user) => [
                'id' => (string) $user->id,
                'name' => $user->name,
            ])->values(),
            'projects' => ProjectResource::collection($projects)->resolve($request),
            'contents' => ContentResource::collection($contents)->resolve($request),
            'tasks' => TaskResource::collection($tasks)->resolve($request),
        ]]);
    }
}
