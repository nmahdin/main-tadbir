<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentResource extends JsonResource
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
            'parentId' => $this->parent_id ? (string) $this->parent_id : null,
            'status' => $this->status,
            'members' => $this->payload['members'] ?? [],
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
            ...($this->manager_id ? ['managerId' => (string) $this->manager_id] : []),
        ];
    }
}
