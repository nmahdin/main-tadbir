<?php

namespace App\Http\Resources;

use App\Services\ContentAccess;
use App\Services\ContentPublication;
use App\Services\ContentReview;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;

class ContentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            ...Arr::except($this->payload ?? [], ['_publication', 'publicationVersion']),
            'access' => ['edit' => $request->user() && app(ContentAccess::class)->canEdit($request->user(), $this->resource)],
            'reviewVersion' => ContentReview::version($this->resource),
            'reviewableStageIds' => collect($this->payload['stages'] ?? [])->filter(fn ($s) => is_array($s) && $request->user() && app(ContentReview::class)->canReview($request->user(), $this->resource, $s))->pluck('id')->values()->all(),
            'publicationVersion' => ContentPublication::version($this->resource),
            'id' => (string) $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'type' => $this->type,
            'status' => $this->canonicalStatus($this->status),
            'previousStatus' => $this->canonicalStatus($this->previous_status),
            'deadline' => $this->deadline?->toDateString(),
            'ownerId' => $this->owner_id !== null ? (string) $this->owner_id : '',
            'projectId' => $this->project_id !== null ? (string) $this->project_id : null,
            'seriesId' => $this->series_id !== null ? (string) $this->series_id : null,
            'seriesName' => $this->series_id === null
                ? null
                : ($this->relationLoaded('series') ? $this->series?->name : $this->series()->value('name')),
            'seriesRevisionId' => $this->series_revision_id !== null ? (string) $this->series_revision_id : null,
            'seriesSequence' => $this->series_sequence,
            'periodKey' => $this->period_key,
            'plannedStartAt' => $this->planned_start_at?->toIso8601String(),
            'seriesActivatedAt' => $this->series_activated_at?->toIso8601String(),
            'isWatched' => $request->user() ? $this->watchers()->where('users.id', $request->user()->id)->exists() : false,
            'comments' => CommentResource::collection($this->whenLoaded('comments')),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }

    private function canonicalStatus(mixed $status): mixed
    {
        return match ($status) {
            'in_progress' => 'producing',
            'completed' => 'approved',
            default => $status,
        };
    }
}
