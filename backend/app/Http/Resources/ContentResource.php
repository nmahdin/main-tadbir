<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            ...($this->payload ?? []),
            'id' => (string) $this->id,
            'title' => $this->title,
            'type' => $this->type,
            'status' => $this->status,
            'deadline' => $this->deadline?->toDateString(),
            'ownerId' => $this->owner_id !== null ? (string) $this->owner_id : '',
            'projectId' => $this->project_id !== null ? (string) $this->project_id : null,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
