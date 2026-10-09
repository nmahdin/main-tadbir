<?php

namespace App\Http\Resources;

use App\Models\Content;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectContentPlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $base = Content::where('project_id', $this->project_id)->where('type', $this->content_type)->where('status', '!=', 'archived');
        return [
            'id' => (string) $this->id,
            'projectId' => (string) $this->project_id,
            'contentType' => $this->content_type,
            'plannedCount' => (int) $this->planned_count,
            'createdCount' => (clone $base)->count(),
            'publishedCount' => (clone $base)->where('status', 'published')->count(),
            'notes' => $this->notes ?? '',
            'defaultSeriesId' => $this->default_series_id ? (string) $this->default_series_id : null,
            'deadline' => $this->deadline?->toDateString(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
