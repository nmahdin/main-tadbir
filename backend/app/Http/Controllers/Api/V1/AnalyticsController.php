<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Content;
use App\Models\Project;
use App\Models\Task;
use App\Models\WorkspaceRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Compact organization-wide aggregates; never derives reports from list pages. */
class AnalyticsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reports.view'), 403);

        $projects = Project::query()
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")
            ->first();
        $tasks = Task::query()
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")
            ->selectRaw("SUM(CASE WHEN deadline < ? AND status NOT IN ('completed', 'archived') THEN 1 ELSE 0 END) as overdue", [today()->toDateString()])
            ->first();
        $contents = Content::query()
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published")
            ->first();
        $ideas = WorkspaceRecord::query()
            ->where('kind', WorkspaceRecord::KIND_IDEA)
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status IN ('approved', 'converted') THEN 1 ELSE 0 END) as approved")
            ->first();
        $letters = WorkspaceRecord::query()
            ->where('kind', WorkspaceRecord::KIND_LETTER)
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status IN ('responded', 'answered', 'archived') THEN 1 ELSE 0 END) as responded")
            ->first();

        $taskStatuses = Task::query()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $contentTypes = Content::query()->selectRaw('type, COUNT(*) as total')->groupBy('type')->pluck('total', 'type');
        $ideaStatuses = WorkspaceRecord::query()->where('kind', WorkspaceRecord::KIND_IDEA)
            ->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        // One grouped query replaces loading every user and task into the browser.
        // Membership is the user's primary department; this definition is exposed
        // in meta so the chart is not mistaken for all secondary memberships.
        $departments = DB::table('departments')
            ->leftJoin('users', function ($join): void {
                $join->on('users.department_id', '=', 'departments.id')->where('users.status', '=', 'active');
            })
            ->leftJoin('tasks', function ($join): void {
                $join->on('tasks.assignee_id', '=', 'users.id')->whereNotIn('tasks.status', ['completed', 'archived']);
            })
            ->where('departments.status', 'active')
            ->groupBy('departments.id', 'departments.name')
            ->orderBy('departments.name')
            ->select(['departments.id', 'departments.name'])
            ->selectRaw('COUNT(DISTINCT users.id) as members_count')
            ->selectRaw('COUNT(tasks.id) as active_tasks')
            ->selectRaw("COALESCE(SUM(CASE tasks.priority WHEN 'urgent' THEN 30 WHEN 'high' THEN 20 WHEN 'medium' THEN 12 WHEN 'low' THEN 6 ELSE 0 END), 0) as workload_score")
            ->get()
            ->map(fn ($department) => [
                'id' => (string) $department->id,
                'name' => $department->name,
                'members' => (int) $department->members_count,
                'activeTasks' => (int) $department->active_tasks,
                'avgWorkload' => $department->members_count > 0
                    ? min(100, (int) round($department->workload_score / $department->members_count)) : 0,
            ]);

        $activeProjects = Project::query()
            ->whereNotIn('status', ['completed', 'archived', 'cancelled'])
            ->latest('updated_at')
            ->limit(6)
            ->get(['id', 'name', 'progress', 'color', 'status'])
            ->map(fn (Project $project) => [
                'id' => (string) $project->id,
                'name' => $project->name,
                'progress' => (int) $project->progress,
                'color' => $project->color,
                'status' => $project->status,
            ]);

        return response()->json(['data' => [
            'projects' => [
                'total' => (int) $projects->total,
                'completed' => (int) $projects->completed,
                'completionRate' => $this->rate($projects->completed, $projects->total),
                'active' => $activeProjects,
            ],
            'tasks' => [
                'total' => (int) $tasks->total,
                'completed' => (int) $tasks->completed,
                'overdue' => (int) $tasks->overdue,
                'completionRate' => $this->rate($tasks->completed, $tasks->total),
                'byStatus' => $taskStatuses->map(fn ($value) => (int) $value),
            ],
            'contents' => [
                'total' => (int) $contents->total,
                'published' => (int) $contents->published,
                'publishRate' => $this->rate($contents->published, $contents->total),
                'byType' => $contentTypes->map(fn ($value) => (int) $value),
            ],
            'ideas' => [
                'total' => (int) $ideas->total,
                'approved' => (int) $ideas->approved,
                'approvalRate' => $this->rate($ideas->approved, $ideas->total),
                'byStatus' => $ideaStatuses->map(fn ($value) => (int) $value),
            ],
            'letters' => ['total' => (int) $letters->total, 'responded' => (int) $letters->responded],
            'departments' => $departments,
        ], 'meta' => [
            'generatedAt' => now()->toIso8601String(),
            'timezone' => config('app.timezone'),
            'departmentMembership' => 'primary',
        ]]);
    }

    private function rate(int|string|null $part, int|string|null $total): int
    {
        return (int) $total > 0 ? (int) round(((int) $part / (int) $total) * 100) : 0;
    }
}
