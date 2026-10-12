<?php

namespace App\Http\Resources;

use App\Models\ContentSeriesRevision;
use App\Services\SeriesAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContentSeriesResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'codePrefix' => $this->code_prefix,
            'contentType' => $this->content_type,
            'projectId' => $this->project_id ? (string) $this->project_id : null,
            'departmentId' => $this->department_id ? (string) $this->department_id : null,
            'ownerId' => $this->owner_id ? (string) $this->owner_id : null,
            'processTemplateId' => $this->process_template_id,
            'recurrenceType' => $this->recurrence_type,
            'recurrenceConfig' => $this->recurrence_config ?? [],
            'status' => $this->status,
            'defaultContentPayload' => $this->default_content_payload ?? [],
            'defaultPublicationConfig' => $this->default_publication_config ?? [],
            'nextSequenceNumber' => (int) $this->next_sequence_number,
            'lockVersion' => (int) ($this->lock_version ?? 1),
            'currentRevisionId' => $this->current_revision_id ? (string) $this->current_revision_id : null,
            'currentRevisionVersion' => (int) ($this->current_revision_version
                ?? ($this->relationLoaded('currentRevision') ? $this->currentRevision?->version : null)
                ?? 1),
            'currentRevision' => $this->whenLoaded('currentRevision', fn () => $this->revision($this->currentRevision)),
            'revisions' => $this->whenLoaded('revisions', fn () => $this->revisions->map(fn ($revision) => $this->revision($revision))->values()),
            'owner' => $this->whenLoaded('owner', fn () => $this->owner ? ['id' => (string) $this->owner->id, 'name' => $this->owner->name] : null),
            'project' => $this->whenLoaded('project', fn () => $this->project ? ['id' => (string) $this->project->id, 'name' => $this->project->name] : null),
            'department' => $this->whenLoaded('department', fn () => $this->department ? ['id' => (string) $this->department->id, 'name' => $this->department->name] : null),
            'occurrenceCount' => (int) ($this->occurrence_count ?? 0),
            'publishedCount' => (int) ($this->published_count ?? 0),
            'plannedCount' => (int) ($this->planned_count ?? 0),
            'activeTaskCount' => (int) ($this->active_task_count ?? 0),
            'contents' => $this->whenLoaded('contents', fn () => ContentResource::collection($this->contents)),
            'createdBy' => $this->created_by ? (string) $this->created_by : null,
            'createdAt' => optional($this->created_at)->toIso8601String(),
            'updatedAt' => optional($this->updated_at)->toIso8601String(),
            'archivedAt' => optional($this->archived_at)->toIso8601String(),
            'access' => [
                'edit' => $request->user() ? app(SeriesAccess::class)->canEdit($request->user(), $this->resource) : false,
                'archive' => $request->user() ? app(SeriesAccess::class)->canArchive($request->user(), $this->resource) : false,
            ],
        ];
    }

    private function revision(?ContentSeriesRevision $revision): ?array
    {
        if (! $revision) {
            return null;
        }

        return [
            'id' => (string) $revision->id,
            'version' => (int) $revision->version,
            'effectiveFromSequence' => (int) $revision->effective_from_sequence,
            'contentType' => $revision->content_type,
            'processTemplateId' => $revision->process_template_id,
            'recurrenceType' => $revision->recurrence_type,
            'recurrenceConfig' => $revision->recurrence_config ?? [],
            'defaultContentPayload' => $revision->default_content_payload ?? [],
            'defaultPublicationConfig' => $revision->default_publication_config ?? [],
            'changeReason' => $revision->change_reason,
            'changedBy' => $revision->changed_by ? (string) $revision->changed_by : null,
            'author' => $revision->relationLoaded('author') && $revision->author
                ? ['id' => (string) $revision->author->id, 'name' => $revision->author->name] : null,
            'createdAt' => optional($revision->created_at)->toIso8601String(),
        ];
    }
}
