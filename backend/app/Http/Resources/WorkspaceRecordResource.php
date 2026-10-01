<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkspaceRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...($this->payload ?? []),
            'id' => (string) $this->id,
            ...($this->client_request_id ? ['clientRequestId' => $this->client_request_id] : []),
            'title' => $this->title ?? ($this->payload['title'] ?? ''),
            'status' => $this->status ?? ($this->payload['status'] ?? null),
            ...($this->kind === 'idea' ? ['comments' => CommentResource::collection($this->whenLoaded('comments'))] : []),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
