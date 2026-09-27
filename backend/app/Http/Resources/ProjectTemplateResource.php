<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectTemplateResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'description' => $this->description ?? '',
            'category' => $this->category ?? 'عمومی',
            'icon' => $this->icon ?? 'Layers',
            'color' => $this->color,
            'defaultPriority' => $this->default_priority,
            'estimatedDurationDays' => (int) $this->estimated_duration_days,
            'budget' => $this->budget,
            'stages' => $this->stages ?? [],
            'tasks' => $this->tasks ?? [],
            'tags' => $this->tags ?? [],
            'isBuiltIn' => (bool) $this->is_built_in,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
