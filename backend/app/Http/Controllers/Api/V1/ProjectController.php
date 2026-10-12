<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProjectRequest;
use App\Http\Requests\WorkspaceListRequest;
use App\Http\Resources\ProjectResource;
use App\Models\ActivityLog;
use App\Models\DamRelation;
use App\Models\Project;
use App\Services\ProjectScopeAccess;
use App\Services\ProjectTemplateApplication;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function index(WorkspaceListRequest $request): AnonymousResourceCollection
    {
        $actor = $request->user();
        $projects = Project::query()
            ->with('members:id')
            ->when($actor->role?->key !== 'admin', fn ($query) => $query->where(function ($scope) use ($actor): void {
                $scope->where('project_manager_id', $actor->id)
                    ->orWhereHas('members', fn ($members) => $members->where('users.id', $actor->id));
            }))
            ->when($request->filled('due'), fn ($query) => $query->whereNotIn('status', ['completed', 'cancelled', 'archived'])
                ->whereDate('deadline', $request->input('due') === 'today' ? '=' : '<', today()->toDateString()))
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%");
                });
            })
            ->when($request->filled('status'), fn ($query) => $request->input('status') === 'open'
                ? $query->whereNotIn('status', ['completed', 'cancelled', 'archived']) : $query->where('status', $request->input('status')))
            ->when($request->string('priority')->toString(), fn ($query, string $priority) => $query->where('priority', $priority))
            ->when($request->integer('project_manager_id'), fn ($query, int $id) => $query->where('project_manager_id', $id))
            ->orderBy($request->input('sort', 'created_at'), $request->input('direction', 'desc'))
            ->orderBy('id', $request->input('direction', 'desc'))
            ->paginate($request->integer('per_page', 20))->withQueryString();

        return ProjectResource::collection($projects);
    }

    public function store(ProjectRequest $request): JsonResponse
    {
        $project = DB::transaction(function () use ($request): Project {
            $data = $request->validated();
            $attributes = $this->attributes($data);
            if (empty($attributes['project_manager_id']) && empty($attributes['template_id'])) {
                $attributes['project_manager_id'] = $request->user()->id;
            }
            $project = Project::create($attributes);
            $project->members()->sync($data['memberIds'] ?? array_filter([$project->project_manager_id]));
            app(ProjectTemplateApplication::class)->apply($request->user(), $project);
            $project->refresh();

            return $project;
        });

        return (new ProjectResource($project->load('members:id')))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Project $project): ProjectResource
    {
        app(ProjectScopeAccess::class)->assertView($request->user(), $project);
        return new ProjectResource($project->load('members:id'));
    }

    public function update(ProjectRequest $request, Project $project): ProjectResource
    {
        app(ProjectScopeAccess::class)->assertEdit($request->user(), $project);
        DB::transaction(function () use ($request, $project): void {
            $data = $request->validated();
            $before = Arr::only($project->getAttributes(), ['name', 'status', 'deadline', 'priority']);
            $project->update($this->attributes($data));
            app(\App\Services\DamService::class)->syncProjectFolderName($project);

            if (array_key_exists('memberIds', $data)) {
                $project->members()->sync($data['memberIds']);
            }
            $changes = [];
            foreach ($before as $field => $value) {
                if ($value != $project->{$field}) $changes[] = ['field' => $field, 'from' => $value, 'to' => $project->{$field}];
            }
            if ($changes) ActivityLog::create(['user_id' => $request->user()->id, 'project_id' => $project->id,
                'type' => 'project_updated', 'action' => 'ویرایش پروژه', 'details' => 'project:'.$project->id,
                'metadata' => ['recordType' => 'project', 'recordId' => (string) $project->id, 'changes' => $changes]]);
        });

        return new ProjectResource($project->refresh()->load('members:id'));
    }

    public function destroy(Request $request, Project $project): Response
    {
        app(ProjectScopeAccess::class)->assertArchive($request->user(), $project);
        if ($project->status !== 'archived') {
            $from = $project->status;
            $project->update(['status' => 'archived']);
            ActivityLog::create(['user_id' => $request->user()->id, 'project_id' => $project->id,
                'type' => 'project_archived', 'action' => 'بایگانی پروژه بدون حذف سوابق و روابط', 'details' => 'project:'.$project->id,
                'metadata' => ['recordType' => 'project', 'recordId' => (string) $project->id,
                    'changes' => [['field' => 'status', 'from' => $from, 'to' => 'archived']]]]);
        }
        return response()->noContent();
    }

    /** Permanently remove an explicitly archived project while preserving linked domain records. */
    public function forceDestroy(Request $request, Project $project): Response
    {
        app(ProjectScopeAccess::class)->assertArchive($request->user(), $project);
        abort_unless($project->status === 'archived', 409, 'حذف نهایی فقط از صفحه بایگانی و برای پروژه بایگانی‌شده مجاز است.');

        DB::transaction(function () use ($request, $project): void {
            $locked = Project::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === 'archived', 409, 'پروژه دیگر در وضعیت بایگانی نیست.');
            DamRelation::query()->where('related_type', 'project')->where('related_id', $locked->id)->delete();
            ActivityLog::create([
                'user_id' => $request->user()->id,
                'project_id' => $locked->id,
                'type' => 'project_force_deleted',
                'action' => 'حذف نهایی پروژه بایگانی‌شده',
                'details' => json_encode(['project_id' => $locked->id, 'name' => $locked->name], JSON_UNESCAPED_UNICODE),
            ]);
            $locked->delete();
        }, 3);

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        $map = [
            'projectManagerId' => 'project_manager_id',
            'startDate' => 'start_date',
            'templateId' => 'template_id',
        ];

        $attributes = Arr::except($data, ['memberIds']);

        foreach ($map as $frontend => $database) {
            if (array_key_exists($frontend, $attributes)) {
                $attributes[$database] = $attributes[$frontend];
                unset($attributes[$frontend]);
            }
        }

        return $attributes;
    }
}
