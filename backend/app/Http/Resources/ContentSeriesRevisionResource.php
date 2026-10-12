<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContentSeriesRevisionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'version' => (int) $this->version,
            'effectiveFromSequence' => (int) $this->effective_from_sequence,
            'contentType' => $this->content_type,
            'processTemplateId' => $this->process_template_id,
            'recurrenceType' => $this->recurrence_type,
            'recurrenceConfig' => $this->recurrence_config ?? [],
            'defaultContentPayload' => $this->default_content_payload ?? [],
            'defaultPublicationConfig' => $this->default_publication_config ?? [],
            'changeReason' => $this->change_reason,
            'changedBy' => $this->changed_by ? (string) $this->changed_by : null,
            'author' => $this->whenLoaded('author', fn () => $this->author
                ? ['id' => (string) $this->author->id, 'name' => $this->author->name]
                : null),
            'createdAt' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
