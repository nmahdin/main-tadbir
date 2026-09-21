<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'key' => $this->key,
            'description' => $this->description ?? '',
            'projectManagerId' => $this->project_manager_id !== null ? (string) $this->project_manager_id : '',
            'memberIds' => $this->members->pluck('id')->map(fn ($id) => (string) $id)->values(),
            'startDate' => $this->start_date?->toDateString() ?? '',
            'deadline' => $this->deadline?->toDateString() ?? '',
            'status' => $this->status,
            'progress' => (int) $this->progress,
            'priority' => $this->priority,
            'tags' => $this->tags ?? [],
            'color' => $this->color,
            'budget' => $this->budget,
            'category' => $this->category ?? '',
            'templateId' => $this->template_id !== null ? (string) $this->template_id : null,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
