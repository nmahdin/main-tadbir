<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProjectTemplate;
use App\Http\Resources\ProjectTemplateResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class ProjectTemplateController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $templates = ProjectTemplate::query()
            ->orderByDesc('is_built_in')
            ->orderBy('id')
            ->get();

        return ProjectTemplateResource::collection($templates);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $template = ProjectTemplate::create($this->attributes($data));

        return (new ProjectTemplateResource($template))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, ProjectTemplate $project_template): ProjectTemplateResource
    {
        $data = $this->validated($request, $project_template);

        $project_template->update($this->attributes($data, $project_template));

        return new ProjectTemplateResource($project_template->refresh());
    }

    public function destroy(ProjectTemplate $project_template): Response
    {
        $project_template->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?ProjectTemplate $template = null): array
    {
        return Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'category' => ['sometimes', 'nullable', 'string', 'max:80'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:60'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'defaultPriority' => ['sometimes', 'nullable', 'string', 'max:20'],
            'estimatedDurationDays' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:3650'],
            'budget' => ['sometimes', 'nullable', 'string', 'max:120'],
            'stages' => ['sometimes', 'nullable', 'array'],
            'tasks' => ['sometimes', 'nullable', 'array'],
            'tags' => ['sometimes', 'nullable', 'array'],
            'isBuiltIn' => ['sometimes', 'boolean'],
        ])->validate();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data, ?ProjectTemplate $template = null): array
    {
        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? $template?->description,
            'category' => $data['category'] ?? $template?->category ?? 'عمومی',
            'icon' => $data['icon'] ?? $template?->icon ?? 'Layers',
            'color' => $data['color'] ?? $template?->color ?? '#6366f1',
            'default_priority' => in_array($data['defaultPriority'] ?? null, ['low', 'medium', 'high', 'urgent'], true)
                ? $data['defaultPriority']
                : ($template?->default_priority ?? 'medium'),
            'estimated_duration_days' => isset($data['estimatedDurationDays'])
                ? (int) $data['estimatedDurationDays']
                : ($template?->estimated_duration_days ?? 30),
            'budget' => $data['budget'] ?? $template?->budget,
            'stages' => $data['stages'] ?? $template?->stages,
            'tasks' => $data['tasks'] ?? $template?->tasks,
            'tags' => $data['tags'] ?? $template?->tags,
            'is_built_in' => $data['isBuiltIn'] ?? $template?->is_built_in ?? false,
        ];
    }
}
