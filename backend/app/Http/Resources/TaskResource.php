<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'title' => $this->title,
            'description' => $this->description ?? '',
            'projectId' => $this->project_id !== null ? (string) $this->project_id : '',
            'contentId' => $this->content_id !== null ? (string) $this->content_id : null,
            'contentStageId' => $this->content_stage_id,
            'kind' => $this->kind ?? 'general',
            'assigneeId' => $this->assignee_id !== null ? (string) $this->assignee_id : '',
            'priority' => $this->priority,
            'status' => $this->status,
            'startDate' => $this->start_date?->toDateString() ?? '',
            'deadline' => $this->deadline?->toDateString() ?? '',
            'estimatedHours' => (int) $this->estimated_hours,
            'loggedHours' => (int) $this->logged_hours,
            'tags' => $this->tags ?? [],
            'subtasks' => [],
            'comments' => $this->comments->map(fn ($comment) => [
                'id' => (string) $comment->id,
                'userId' => (string) $comment->user_id,
                'text' => $comment->text,
                'timestamp' => $comment->created_at?->toIso8601String(),
                'attachments' => [],
            ])->values(),
            'attachments' => $this->attachments->map(fn ($attachment) => [
                'id' => (string) $attachment->id,
                'name' => $attachment->name,
                'size' => $attachment->size,
                'type' => $attachment->type,
                'url' => $attachment->url,
                'uploadDate' => $attachment->created_at?->toIso8601String(),
                'uploadedBy' => (string) $attachment->uploaded_by,
            ])->values(),
            'activityHistory' => $this->activityLogs->map(fn ($activity) => [
                'id' => (string) $activity->id,
                'userId' => (string) $activity->user_id,
                'action' => $activity->action,
                'type' => $activity->type,
                'timestamp' => $activity->created_at?->toIso8601String(),
                'details' => $activity->details,
                'taskId' => (string) $this->id,
                'projectId' => (string) $this->project_id,
            ])->values(),
            'dependencies' => collect($this->dependencies ?? [])->map(fn ($id) => (string) $id)->values(),
            'isBlocked' => (bool) $this->is_blocked,
            'blockedReason' => $this->blocked_reason,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
