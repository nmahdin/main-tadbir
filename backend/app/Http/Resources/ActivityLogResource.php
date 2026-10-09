<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ActivityLogResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'userId' => $this->user_id ? (string) $this->user_id : '',
            'action' => $this->type === 'client_note' ? 'یادداشت کاربر: '.$this->action : $this->action,
            'type' => $this->type ?? 'status_change',
            'timestamp' => $this->created_at?->toIso8601String(),
            'details' => $this->details,
            'metadata' => $this->metadata ?? [],
            'taskId' => $this->task_id ? (string) $this->task_id : null,
            'taskTitle' => $this->whenLoaded('task', fn () => $this->task?->title),
            'projectId' => $this->project_id ? (string) $this->project_id : null,
            'projectName' => $this->whenLoaded('project', fn () => $this->project?->name),
        ];
    }
}
