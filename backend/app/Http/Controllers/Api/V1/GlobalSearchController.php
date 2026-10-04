<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Content;
use App\Models\Project;
use App\Models\Task;
use App\Services\ContentAccess;
use App\Services\TaskOperations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Small, permission-scoped search projections for fast navigation.
 *
 * Deliberately returns no full resources or relation histories: search results
 * are navigation hints and loading comments/files here would turn every
 * keystroke into a large workspace response.
 */
class GlobalSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'min:2', 'max:120'],
            'limit' => ['sometimes', 'integer', 'between:1,8'],
        ]);
        $query = trim($data['query']);
        abort_if(mb_strlen($query) < 2, 422, 'عبارت جست‌وجو باید حداقل دو نویسه داشته باشد.');

        $limit = (int) ($data['limit'] ?? 5);
        $like = '%'.$this->escapeLike($query).'%';
        $actor = $request->user()->loadMissing('role.permissions');

        $projects = collect();
        if ($actor->hasPermission('projects.view')) {
            $projects = Project::query()
                ->select(['id', 'name', 'description', 'status', 'color', 'updated_at'])
                ->where(function ($builder) use ($like): void {
                    $builder->where('name', 'like', $like)
                        ->orWhere('description', 'like', $like);
                })
                ->latest('updated_at')
                ->limit($limit)
                ->get()
                ->map(fn (Project $project) => [
                    'id' => (string) $project->id,
                    'name' => $project->name,
                    'description' => $project->description ?? '',
                    'status' => $project->status,
                    'color' => $project->color,
                ]);
        }

        $tasks = app(TaskOperations::class)->visibleTo($actor)
            ->select(['id', 'project_id', 'title', 'status', 'priority', 'deadline', 'updated_at'])
            ->with('project:id,name,color')
            ->where('title', 'like', $like)
            ->latest('updated_at')
            ->limit($limit)
            ->get()
            ->map(fn (Task $task) => [
                'id' => (string) $task->id,
                'title' => $task->title,
                'status' => $task->status,
                'priority' => $task->priority,
                'deadline' => $task->deadline?->toDateString() ?? '',
                'projectId' => $task->project_id !== null ? (string) $task->project_id : '',
                'project' => $task->project ? [
                    'id' => (string) $task->project->id,
                    'name' => $task->project->name,
                    'color' => $task->project->color,
                ] : null,
            ]);

        $contents = collect();
        $contentAccess = app(ContentAccess::class);
        if ($contentAccess->canEnter($actor)) {
            $contents = $contentAccess->visibleTo($actor)
                ->select(['id', 'code', 'title', 'type', 'status', 'payload', 'updated_at'])
                ->where(function ($builder) use ($like): void {
                    // A stable code is the primary navigation key for archive work.
                    $builder->where('title', 'like', $like)
                        ->orWhere('code', 'like', $like)
                        ->orWhere('payload->topic', 'like', $like)
                        ->orWhere('payload->description', 'like', $like)
                        ->orWhere('payload->seriesCode', 'like', $like);
                })
                ->latest('updated_at')
                ->limit($limit)
                ->get()
                ->map(fn (Content $content) => [
                    'id' => (string) $content->id,
                    'code' => $content->code,
                    'title' => $content->title,
                    'type' => $content->type,
                    'status' => $content->status,
                    'topic' => $content->payload['topic'] ?? '',
                    'seriesCode' => $content->payload['seriesCode'] ?? null,
                ]);
        }

        return response()->json([
            'data' => [
                'projects' => $projects->values(),
                'tasks' => $tasks->values(),
                'contents' => $contents->values(),
            ],
            'meta' => ['query' => $query, 'limit' => $limit],
        ]);
    }

    private function escapeLike(string $value): string
    {
        return addcslashes($value, '\\%_');
    }
}
