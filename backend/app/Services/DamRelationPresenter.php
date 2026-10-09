<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use App\Models\WorkspaceRecord;
use Illuminate\Support\Collection;

/** Resolve human-readable "used in" summaries from real DAM relations. */
final class DamRelationPresenter
{
    /** @param Collection<int, DamAsset> $assets */
    public function attach(Collection $assets): Collection
    {
        $relations = $assets->flatMap->relations;
        $contents = Content::query()->whereIn('id', $this->ids($relations, 'content'))->get()->keyBy('id');
        $tasks = Task::query()->whereIn('id', $this->ids($relations, 'task'))->get(['id', 'title', 'content_stage_id'])->keyBy('id');
        $projects = Project::query()->whereIn('id', $this->ids($relations, 'project'))->get(['id', 'name'])->keyBy('id');
        $departments = Department::query()->whereIn('id', $this->ids($relations, 'department'))->get(['id', 'name'])->keyBy('id');
        $workspaceIds = [...$this->ids($relations, 'idea'), ...$this->ids($relations, 'meeting')];
        $workspaceRecords = WorkspaceRecord::query()->whereIn('id', $workspaceIds)->get(['id', 'kind', 'title'])->keyBy('id');

        foreach ($assets as $asset) {
            $usedIn = $asset->relations->map(function ($relation) use ($contents, $tasks, $projects, $departments, $workspaceRecords): array {
                $label = match ($relation->related_type) {
                    'content' => ($content = $contents->get($relation->related_id))
                        ? trim(((string) $content->code).' — '.$content->title, " —") : 'محتوا #'.$relation->related_id,
                    'task' => ($task = $tasks->get($relation->related_id))
                        ? $task->title : 'وظیفه #'.$relation->related_id,
                    'project' => ($project = $projects->get($relation->related_id))
                        ? $project->name : 'پروژه #'.$relation->related_id,
                    'department' => ($department = $departments->get($relation->related_id))
                        ? $department->name : 'دپارتمان #'.$relation->related_id,
                    'idea' => ($record = $workspaceRecords->get($relation->related_id))
                        ? 'ایده: '.$record->title : 'ایده #'.$relation->related_id,
                    'meeting' => ($record = $workspaceRecords->get($relation->related_id))
                        ? 'جلسه: '.$record->title : 'جلسه #'.$relation->related_id,
                    default => $relation->related_type.' #'.$relation->related_id,
                };
                $stageLabel = null;
                if ($relation->stage_id && $relation->related_type === 'content' && ($content = $contents->get($relation->related_id))) {
                    $stage = collect($content->payload['stages'] ?? [])->first(
                        fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === (string) $relation->stage_id,
                    );
                    $stageLabel = is_array($stage) ? ($stage['title'] ?? $relation->stage_id) : $relation->stage_id;
                }

                return [
                    'type' => $relation->related_type,
                    'id' => (int) $relation->related_id,
                    'label' => $label,
                    'relationRole' => $relation->relation_type,
                    'stageId' => $relation->stage_id,
                    'stageLabel' => $stageLabel,
                    'outputId' => $relation->output_id,
                    'assetVersionId' => $relation->asset_version_id,
                ];
            })->values();
            $asset->setAttribute('used_in', $usedIn->all());
            $asset->setAttribute('used_in_count', $usedIn->count());
        }

        return $assets;
    }

    private function ids(Collection $relations, string $type): array
    {
        return $relations->where('related_type', $type)->pluck('related_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
