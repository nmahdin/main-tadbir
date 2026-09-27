<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            'color' => $this->color,
            'isSystem' => (bool) $this->is_system,
            'isActive' => (bool) $this->is_active,
            'userCount' => (int) ($this->users_count ?? 0),
            'permissions' => $this->permissions->pluck('key')->all(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
