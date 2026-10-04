<?php

namespace App\Http\Resources;

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
            'description' => $this->description ?? '',
            'codePrefix' => $this->code_prefix,
            'contentType' => $this->content_type,
            'projectId' => $this->project_id ? (string) $this->project_id : null,
            'departmentId' => $this->department_id ? (string) $this->department_id : null,
            'ownerId' => $this->owner_id ? (string) $this->owner_id : null,
            'processTemplateId' => $this->process_template_id,
            'status' => $this->status,
            'recurrenceType' => $this->recurrence_type,
            'recurrenceConfig' => $this->recurrence_config ?? [],
            'defaultContentPayload' => $this->default_content_payload ?? [],
            'defaultPublicationConfig' => $this->default_publication_config ?? [],
            'nextSequenceNumber' => (int) ($this->next_sequence_number ?? 1),
            'createdBy' => $this->created_by ? (string) $this->created_by : null,
            'archivedAt' => $this->archived_at?->toIso8601String(),
            'occurrenceCount' => $this->whenCounted('contents'),
            'latestOccurrence' => $this->whenLoaded('contents', function () {
                $content = $this->contents->first();
                return $content ? new ContentResource($content) : null;
            }),
            'access' => [
                'edit' => $request->user() && app(SeriesAccess::class)->canEdit($request->user(), $this->resource),
                'archive' => $request->user() && app(SeriesAccess::class)->canArchive($request->user(), $this->resource),
            ],
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
