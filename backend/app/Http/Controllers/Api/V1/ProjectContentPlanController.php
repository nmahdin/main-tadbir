<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectContentPlanResource;
use App\Models\ContentSeries;
use App\Models\Project;
use App\Models\ProjectContentPlan;
use App\Services\ProjectScopeAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectContentPlanController extends Controller
{
    public function index(Request $request, Project $project)
    {
        app(ProjectScopeAccess::class)->assertView($request->user(), $project);
        return ProjectContentPlanResource::collection($project->contentPlans()->orderBy('content_type')->get());
    }

    public function store(Request $request, Project $project)
    {
        app(ProjectScopeAccess::class)->assertEdit($request->user(), $project);
        $data = $this->validateRow($request);
        $this->guardSeries($project, $data['defaultSeriesId'] ?? null);
        $plan = ProjectContentPlan::updateOrCreate([
            'project_id' => $project->id, 'content_type' => $data['contentType'],
        ], $this->attributes($data, $request->user()->id));
        return (new ProjectContentPlanResource($plan))->response()->setStatusCode($plan->wasRecentlyCreated ? 201 : 200);
    }

    public function update(Request $request, Project $project, ProjectContentPlan $plan)
    {
        abort_unless((int) $plan->project_id === (int) $project->id, 404);
        app(ProjectScopeAccess::class)->assertEdit($request->user(), $project);
        $data = $this->validateRow($request, false);
        if (isset($data['contentType']) && $data['contentType'] !== $plan->content_type) {
            abort_if(ProjectContentPlan::where('project_id', $project->id)->where('content_type', $data['contentType'])
                ->where('id', '!=', $plan->id)->exists(), 422, 'برای این نوع محتوا قبلاً ردیف برنامه ثبت شده است.');
        }
        $this->guardSeries($project, $data['defaultSeriesId'] ?? $plan->default_series_id);
        $plan = DB::transaction(function () use ($plan, $data): ProjectContentPlan {
            $locked = ProjectContentPlan::whereKey($plan->id)->lockForUpdate()->firstOrFail();
            $locked->update($this->attributes($data));
            return $locked;
        });
        return new ProjectContentPlanResource($plan->refresh());
    }

    public function destroy(Request $request, Project $project, ProjectContentPlan $plan)
    {
        abort_unless((int) $plan->project_id === (int) $project->id, 404);
        app(ProjectScopeAccess::class)->assertEdit($request->user(), $project);
        $plan->delete();
        return response()->noContent();
    }

    private function validateRow(Request $request, bool $create = true): array
    {
        return $request->validate([
            'contentType' => [$create ? 'required' : 'sometimes', 'string', 'max:80'],
            'plannedCount' => [$create ? 'required' : 'sometimes', 'integer', 'between:0,100000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'defaultSeriesId' => ['sometimes', 'nullable', 'integer', 'exists:content_series,id'],
            'deadline' => ['sometimes', 'nullable', 'date'],
            // created/published counts are intentionally absent: they are derived.
        ]);
    }

    private function guardSeries(Project $project, mixed $seriesId): void
    {
        if (! $seriesId) return;
        abort_unless(ContentSeries::whereKey($seriesId)->where('project_id', $project->id)->exists(), 422,
            'مجموعه پیش‌فرض باید متعلق به همین پروژه باشد.');
    }

    private function attributes(array $data, ?int $creator = null): array
    {
        $map = ['contentType' => 'content_type', 'plannedCount' => 'planned_count', 'notes' => 'notes',
            'defaultSeriesId' => 'default_series_id', 'deadline' => 'deadline'];
        $attributes = [];
        foreach ($map as $key => $column) if (array_key_exists($key, $data)) $attributes[$column] = $data[$key];
        if ($creator) $attributes['created_by'] = $creator;
        return $attributes;
    }
}
