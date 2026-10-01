<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProjectRequest;
use App\Http\Requests\WorkspaceListRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Services\ProjectTemplateApplication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function index(WorkspaceListRequest $request): AnonymousResourceCollection
    {
        $projects = Project::query()
            ->with('members:id')
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
            $project = Project::create($this->attributes($data));
            $project->members()->sync($data['memberIds'] ?? array_filter([$project->project_manager_id]));
            app(ProjectTemplateApplication::class)->apply($request->user(), $project);
            $project->refresh();

            return $project;
        });

        return (new ProjectResource($project->load('members:id')))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Project $project): ProjectResource
    {
        return new ProjectResource($project->load('members:id'));
    }

    public function update(ProjectRequest $request, Project $project): ProjectResource
    {
        DB::transaction(function () use ($request, $project): void {
            $data = $request->validated();
            $project->update($this->attributes($data));

            if (array_key_exists('memberIds', $data)) {
                $project->members()->sync($data['memberIds']);
            }
        });

        return new ProjectResource($project->refresh()->load('members:id'));
    }

    public function destroy(Project $project): Response
    {
        $project->delete();

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
