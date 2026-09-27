<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamResource extends JsonResource
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
            'leaderId' => $this->leader_id ? (string) $this->leader_id : null,
            'type' => $this->type,
            'departmentId' => $this->department_id ? (string) $this->department_id : null,
            'department' => $this->payload['department']
                ?? $this->department?->name
                ?? '',
            'memberIds' => $this->users->map(fn ($user) => (string) $user->id)->all(),
            'projectIds' => $this->payload['projectIds'] ?? [],
            'color' => $this->color,
            'status' => $this->status,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
