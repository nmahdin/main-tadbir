<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;

/**
 * رکورد عمومی دامنه: کل payload به‌همراه شناسه و زمان‌ها بازگردانده می‌شود.
 */
class DomainRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            ...Arr::except($this->payload ?? [], ['_meeting_snapshot', '_reminder_actor', '_bale_kind', '_notification_actor']),
            'id' => (string) $this->id,
            ...($this->domain === 'asset' ? ['comments' => CommentResource::collection($this->whenLoaded('comments'))] : []),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
