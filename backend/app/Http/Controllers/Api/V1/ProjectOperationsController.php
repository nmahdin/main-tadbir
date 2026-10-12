<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Http\Resources\ContentResource;
use App\Http\Resources\ContentSeriesResource;
use App\Http\Resources\TaskResource;
use App\Http\Resources\WorkspaceRecordResource;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\DamAsset;
use App\Models\Project;
use App\Models\Task;
use App\Models\WorkspaceRecord;
use App\Services\ContentAccess;
use App\Services\DamAssetAccess;
use App\Services\ProjectProgress;
use App\Services\ProjectScopeAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectOperationsController extends Controller
{
    public function summary(Request $request, Project $project)
    {
        app(ProjectScopeAccess::class)->assertView($request->user(), $project);
        $contentAccess = app(ContentAccess::class);
        $canViewContent = $contentAccess->canEnter($request->user());
        $contents = ($canViewContent ? $contentAccess->visibleTo($request->user()) : Content::query()->whereRaw('1 = 0'))
            ->where('project_id', $project->id)->where('status', '!=', 'archived');
        $tasks = Task::where('project_id', $project->id)->where('status', '!=', 'archived');
        return response()->json(['data' => [
            'progress' => app(ProjectProgress::class)->calculate($project),
            'contents' => $canViewContent ? (clone $contents)->count() : 0,
            'publishedContents' => $canViewContent ? (clone $contents)->where('status', 'published')->count() : 0,
            'series' => $canViewContent ? ContentSeries::where('project_id', $project->id)->where('status', '!=', 'archived')->count() : 0,
            'tasks' => $request->user()->hasPermission('tasks.view') ? (clone $tasks)->count() : 0,
            'completedTasks' => $request->user()->hasPermission('tasks.view') ? (clone $tasks)->where('status', 'completed')->count() : 0,
            'assets' => $request->user()->hasPermission('assets.view') ? $this->assetQuery($request, $project)->count() : 0,
            'ideas' => $request->user()->hasPermission('thinktank.view') ? WorkspaceRecord::where('project_id', $project->id)->where('kind', WorkspaceRecord::KIND_IDEA)->count() : 0,
            'meetings' => $request->user()->hasPermission('meetings.view') ? WorkspaceRecord::where('project_id', $project->id)->where('kind', WorkspaceRecord::KIND_MEETING)->count() : 0,
            'activities' => $request->user()->hasPermission('reports.view') ? ActivityLog::where('project_id', $project->id)->count() : 0,
            'activeContents' => $canViewContent ? (clone $contents)->whereNotIn('status', ['published', 'cancelled', 'suspended'])->count() : 0,
            'openTasks' => $request->user()->hasPermission('tasks.view') ? (clone $tasks)->where('status', '!=', 'completed')->count() : 0,
            'overdueTasks' => $request->user()->hasPermission('tasks.view') ? (clone $tasks)->where('status', '!=', 'completed')->whereDate('deadline', '<', today())->count() : 0,
            'readyPublish' => $canViewContent ? (clone $contents)->where('status', 'ready_to_publish')->count() : 0,
            'latestActivities' => $request->user()->hasPermission('reports.view') ? ActivityLog::where('project_id', $project->id)
                ->latest()->limit(5)->get()->map(fn ($log) => ['id' => (string) $log->id, 'action' => $log->action,
                    'type' => $log->type, 'timestamp' => $log->created_at?->toIso8601String(), 'metadata' => $log->metadata ?? []])->values()->all() : [],
        ]]);
    }

    public function items(Request $request, Project $project, string $domain)
    {
        app(ProjectScopeAccess::class)->assertView($request->user(), $project);
        $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'search' => ['sometimes', 'string', 'max:120'], 'status' => ['sometimes', 'string', 'max:80'],
            'type' => ['sometimes', 'string', 'max:80'],
            'from' => ['sometimes', 'date_format:Y-m-d'], 'to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $size = $request->integer('per_page', 20);
        $search = $request->string('search')->toString();
        $status = $request->string('status')->toString();

        return match ($domain) {
            'contents' => $this->contents($request, $project, $size, $search, $status),
            'series' => $this->series($request, $project, $size, $search, $status),
            'tasks' => $this->tasks($request, $project, $size, $search, $status),
            'assets' => $this->assets($request, $project, $size, $search, $status),
            'ideas' => $this->records($request, $project, WorkspaceRecord::KIND_IDEA, $size, $search, $status),
            'meetings' => $this->records($request, $project, WorkspaceRecord::KIND_MEETING, $size, $search, $status),
            'activities' => $this->activities($request, $project, $size, $search),
            default => abort(404),
        };
    }

    private function contents(Request $request, Project $project, int $size, string $search, string $status)
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        $query = app(ContentAccess::class)->visibleTo($request->user())->where('project_id', $project->id)
            ->when($search, fn ($q) => $q->where('title', 'like', "%{$search}%"))
            ->when($status, fn ($q) => $q->where('status', $status))->latest();
        return ContentResource::collection($query->paginate($size));
    }

    private function series(Request $request, Project $project, int $size, string $search, string $status)
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        $query = ContentSeries::where('project_id', $project->id)->withCount('contents')
            ->when($search, fn ($q) => $q->where('name', 'like', "%{$search}%"))
            ->when($status, fn ($q) => $q->where('status', $status))->latest();
        return ContentSeriesResource::collection($query->paginate($size));
    }

    private function tasks(Request $request, Project $project, int $size, string $search, string $status)
    {
        abort_unless($request->user()->hasPermission('tasks.view'), 403);
        $query = Task::where('project_id', $project->id)->with(['comments.user', 'attachments', 'activityLogs'])
            ->when($search, fn ($q) => $q->where('title', 'like', "%{$search}%"))
            ->when($status, fn ($q) => $q->where('status', $status))->latest();
        return TaskResource::collection($query->paginate($size));
    }

    private function assets(Request $request, Project $project, int $size, string $search, string $status)
    {
        abort_unless($request->user()->hasPermission('assets.view'), 403);
        $page = $this->assetQuery($request, $project)
            ->with(['latestFile', 'latestVersion', 'contentItem', 'relations', 'tags', 'category', 'folder'])
            ->when($search, fn ($q) => $q->where('title', 'like', "%{$search}%"))
            ->when($status, fn ($q) => $q->where('status', $status))->latest()->paginate($size);
        $page->setCollection(app(\App\Services\DamRelationPresenter::class)->attach($page->getCollection()));
        return $page;
    }

    private function records(Request $request, Project $project, string $kind, int $size, string $search, string $status)
    {
        $permission = $kind === WorkspaceRecord::KIND_IDEA ? 'thinktank.view' : 'meetings.view';
        abort_unless($request->user()->hasPermission($permission), 403);
        $query = WorkspaceRecord::where('project_id', $project->id)->where('kind', $kind)
            ->when($kind === WorkspaceRecord::KIND_IDEA, fn ($q) => $q->with('comments.user'))
            ->when($search, fn ($q) => $q->where('title', 'like', "%{$search}%"))
            ->when($status, fn ($q) => $q->where('status', $status))->latest();
        return WorkspaceRecordResource::collection($query->paginate($size));
    }

    private function activities(Request $request, Project $project, int $size, string $search)
    {
        abort_unless($request->user()->hasPermission('reports.view'), 403);
        $query = ActivityLog::where('project_id', $project->id)
            ->with(['user', 'task', 'project'])
            ->when($search, fn ($q) => $q->where(fn ($text) => $text->where('action', 'like', "%{$search}%")
                ->orWhere('details', 'like', "%{$search}%")->orWhere('type', 'like', "%{$search}%")))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->input('to')))
            ->latest();
        return ActivityLogResource::collection($query->paginate($size));
    }

    private function assetQuery(Request $request, Project $project): Builder
    {
        return app(DamAssetAccess::class)->visibleTo($request->user())
            ->whereHas('relations', function (Builder $relations) use ($project): void {
                $relations->where(function (Builder $related) use ($project): void {
                    $related->where(fn (Builder $q) => $q->where('related_type', 'project')->where('related_id', $project->id))
                        ->orWhere(fn (Builder $q) => $q->where('related_type', 'content')->whereIn('related_id', Content::where('project_id', $project->id)->select('id')))
                        ->orWhere(fn (Builder $q) => $q->where('related_type', 'task')->whereIn('related_id', Task::where('project_id', $project->id)->select('id')));
                });
            });
    }
}
