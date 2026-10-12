<?php

namespace App\Http\Resources;

use App\Models\DomainRecord;
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
        $payload = $this->payload ?? [];
        $actorId = (string) ($request->user()?->id ?? '');
        $personal = [];
        if ($this->domain === DomainRecord::DOMAIN_CHAT_MESSAGE) {
            $starredBy = is_array($payload['starredBy'] ?? null) ? $payload['starredBy'] : [];
            $personal['isStarred'] = in_array($actorId, array_map('strval', $starredBy), true);
        } elseif ($this->domain === DomainRecord::DOMAIN_CONVERSATION) {
            $mutedBy = is_array($payload['mutedBy'] ?? null) ? $payload['mutedBy'] : [];
            $readAtBy = is_array($payload['readAtBy'] ?? null) ? $payload['readAtBy'] : [];
            $personal['isMuted'] = in_array($actorId, array_map('strval', $mutedBy), true);
            $readAt = is_string($readAtBy[$actorId] ?? null) ? $readAtBy[$actorId] : null;
            $personal['unreadCount'] = DomainRecord::query()
                ->where('domain', DomainRecord::DOMAIN_CHAT_MESSAGE)
                ->where('parent_id', $this->id)
                ->where('user_id', '!=', $request->user()?->id)
                ->when($readAt, fn ($query, string $date) => $query->where('created_at', '>', $date))
                ->count();
        }

        return [
            ...Arr::except($payload, ['_meeting_snapshot', '_reminder_actor', '_bale_kind', '_notification_actor', 'starredBy', 'mutedBy', 'readAtBy']),
            ...$personal,
            'id' => (string) $this->id,
            ...($this->domain === 'asset' ? ['comments' => CommentResource::collection($this->whenLoaded('comments'))] : []),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $payload['updatedAt'] ?? $this->updated_at?->toIso8601String(),
        ];
    }
}
