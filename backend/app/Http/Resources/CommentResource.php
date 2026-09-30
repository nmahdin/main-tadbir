<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CommentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $metadata = is_array($this->metadata) ? $this->metadata : [];

        return [
            'id' => (string) $this->id,
            'userId' => $this->user_id ? (string) $this->user_id : '',
            'userName' => $this->user?->name ?? 'کاربر حذف‌شده',
            'userAvatar' => $this->user?->avatar,
            'text' => $this->body,
            'timestamp' => $this->created_at?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'replyToId' => $this->parent_id ? (string) $this->parent_id : null,
            'assetIds' => $metadata['asset_ids'] ?? [],
            'reactions' => $metadata['reactions'] ?? [],
            'subjectType' => $this->subject_type,
            'subjectId' => (string) $this->subject_id,
            'subjectTitle' => $this->getAttribute('subject_title') ?? '',
            'subjectUrl' => $this->getAttribute('subject_url'),
        ];
    }
}
