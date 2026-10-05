<?php

namespace App\Services;

use App\Models\ContentSeries;
use App\Models\ContentSeriesRevision;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

/** Canonicalizes Series defaults and publishes immutable future configuration revisions. */
final class SeriesConfigurationService
{
    /** @param array<string,mixed> $data @return array<string,mixed> */
    public function canonicalize(array $data, ?ContentSeries $existing = null): array
    {
        $contentType = (string) ($data['contentType'] ?? $existing?->content_type ?? '');
        $configuredTypes = collect(SystemSetting::query()->where('key', 'content_types')->value('value') ?? [])
            ->filter(fn ($item) => is_array($item))->pluck('id')->map(fn ($id) => (string) $id);
        if ($configuredTypes->isNotEmpty() && ! $configuredTypes->contains($contentType)) {
            throw ValidationException::withMessages(['contentType' => 'نوع محتوای انتخاب‌شده در تنظیمات فعال سازمان وجود ندارد.']);
        }

        $templateId = array_key_exists('processTemplateId', $data)
            ? ($data['processTemplateId'] ?: null)
            : $existing?->process_template_id;
        $templates = collect(SystemSetting::query()->where('key', 'process_templates')->value('value') ?? [])
            ->filter(fn ($item) => is_array($item));
        $template = $templateId ? $templates->first(fn ($item) => (string) ($item['id'] ?? '') === (string) $templateId) : null;
        if ($templateId && $templates->isNotEmpty() && ! $template) {
            throw ValidationException::withMessages(['processTemplateId' => 'قالب فرایند انتخاب‌شده دیگر معتبر نیست.']);
        }

        $defaults = array_key_exists('defaultContentPayload', $data)
            ? $this->contentDefaults((array) $data['defaultContentPayload'])
            : ($existing?->default_content_payload ?? []);
        if (! empty($data['applyTemplate']) && $template) {
            $defaults['stages'] = $this->templateStages((array) ($template['stages'] ?? []));
        }
        $publication = array_key_exists('defaultPublicationConfig', $data)
            ? $this->publicationDefaults((array) $data['defaultPublicationConfig'])
            : ($existing?->default_publication_config ?? []);

        $general = SystemSetting::query()->where('key', 'general')->value('value');
        $calendar = in_array(($general['calendar'] ?? null), ['jalali', 'gregorian'], true)
            ? $general['calendar'] : 'jalali';
        $recurrence = [
            ...($existing?->recurrence_config ?? []),
            ...(array) ($data['recurrenceConfig'] ?? []),
        ];
        $recurrence = Arr::only($recurrence, [
            'startDate', 'interval', 'deadlineOffsetDays', 'calendar', 'dayOfMonth', 'activationTime',
        ]);
        $recurrence['calendar'] = in_array(($recurrence['calendar'] ?? null), ['jalali', 'gregorian'], true)
            ? $recurrence['calendar'] : $calendar;
        $recurrence['interval'] = max(1, min(120, (int) ($recurrence['interval'] ?? 1)));
        $recurrence['deadlineOffsetDays'] = max(0, min(3650, (int) ($recurrence['deadlineOffsetDays'] ?? 0)));
        if (isset($recurrence['dayOfMonth'])) {
            $recurrence['dayOfMonth'] = max(1, min(31, (int) $recurrence['dayOfMonth']));
        }
        if (isset($recurrence['activationTime']) && preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', (string) $recurrence['activationTime']) !== 1) {
            unset($recurrence['activationTime']);
        }

        return [
            'contentType' => $contentType,
            'processTemplateId' => $templateId,
            'recurrenceType' => (string) ($data['recurrenceType'] ?? $existing?->recurrence_type ?? 'manual'),
            'recurrenceConfig' => $recurrence,
            'defaultContentPayload' => $defaults,
            'defaultPublicationConfig' => $publication,
        ];
    }

    public function createInitial(ContentSeries $series, User $actor, ?string $reason = null): ContentSeriesRevision
    {
        $revision = $series->revisions()->create([
            ...$this->revisionAttributes($series),
            'version' => 1,
            'effective_from_sequence' => 1,
            'change_reason' => $reason ?: 'نسخه اولیه مجموعه',
            'changed_by' => $actor->id,
        ]);
        $series->update(['current_revision_id' => $revision->id, 'lock_version' => max(1, (int) $series->lock_version)]);

        return $revision;
    }

    public function publishIfChanged(ContentSeries $series, User $actor, ?string $reason = null): ContentSeriesRevision
    {
        $current = $series->currentRevision()->first();
        $candidate = $this->revisionAttributes($series);
        if ($current && $this->fingerprint($candidate) === $this->fingerprint(Arr::only($current->toArray(), array_keys($candidate)))) {
            return $current;
        }
        $version = ((int) $series->revisions()->max('version')) + 1;
        $revision = $series->revisions()->create([
            ...$candidate,
            'version' => $version,
            'effective_from_sequence' => max(1, (int) $series->next_sequence_number),
            'change_reason' => trim((string) $reason) ?: 'به‌روزرسانی تنظیمات رخدادهای آینده',
            'changed_by' => $actor->id,
        ]);
        $series->update(['current_revision_id' => $revision->id]);

        return $revision;
    }

    /** @return array<string,mixed> */
    public function effective(ContentSeries $series): array
    {
        $revision = $series->relationLoaded('currentRevision') ? $series->currentRevision : $series->currentRevision()->first();

        return $revision ? [
            'id' => $revision->id,
            'version' => $revision->version,
            'contentType' => $revision->content_type,
            'processTemplateId' => $revision->process_template_id,
            'recurrenceType' => $revision->recurrence_type,
            'recurrenceConfig' => $revision->recurrence_config ?? [],
            'defaultContentPayload' => $revision->default_content_payload ?? [],
            'defaultPublicationConfig' => $revision->default_publication_config ?? [],
        ] : [
            'id' => null,
            'version' => 1,
            'contentType' => $series->content_type,
            'processTemplateId' => $series->process_template_id,
            'recurrenceType' => $series->recurrence_type,
            'recurrenceConfig' => $series->recurrence_config ?? [],
            'defaultContentPayload' => $series->default_content_payload ?? [],
            'defaultPublicationConfig' => $series->default_publication_config ?? [],
        ];
    }

    /** @return array<string,mixed> */
    private function revisionAttributes(ContentSeries $series): array
    {
        return [
            'content_type' => $series->content_type,
            'process_template_id' => $series->process_template_id,
            'recurrence_type' => $series->recurrence_type,
            'recurrence_config' => $series->recurrence_config ?? [],
            'default_content_payload' => $series->default_content_payload ?? [],
            'default_publication_config' => $series->default_publication_config ?? [],
        ];
    }

    /** @param array<string,mixed> $payload @return array<string,mixed> */
    private function contentDefaults(array $payload): array
    {
        $defaults = Arr::only($payload, [
            'topic', 'description', 'targetAudience', 'priority', 'tags', 'assetIds', 'stages', 'publishInfo',
        ]);
        $defaults['tags'] = collect($defaults['tags'] ?? [])->filter(fn ($item) => is_string($item))->map(fn ($tag) => mb_substr(trim($tag), 0, 80))
            ->filter()->unique()->take(50)->values()->all();
        $defaults['assetIds'] = collect($defaults['assetIds'] ?? [])->filter(fn ($id) => is_numeric($id) && (int) $id > 0)
            ->map(fn ($id) => (int) $id)->unique()->take(100)->values()->all();
        $defaults['stages'] = $this->safeStages((array) ($defaults['stages'] ?? []));
        if (isset($defaults['publishInfo']) && is_array($defaults['publishInfo'])) {
            $defaults['publishInfo'] = $this->publicationDefaults($defaults['publishInfo']);
        }

        return $defaults;
    }

    /** @param array<int,mixed> $stages @return array<int,array<string,mixed>> */
    private function safeStages(array $stages): array
    {
        return collect($stages)->filter(fn ($item) => is_array($item))->take(30)->values()->map(function (array $stage, int $index): array {
            $safe = Arr::only($stage, [
                'id', 'stageKey', 'title', 'description', 'departmentId', 'departmentName', 'assigneeId',
                'assigneeRole', 'reviewerId', 'reviewRequired', 'advanceMode', 'reviewerStrategy', 'deadlinePolicy',
                'order', 'relativeDueDays', 'daysFromStart', 'status', 'inputs', 'outputs', 'checklist',
            ]);
            $safe['id'] = mb_substr((string) ($safe['id'] ?? 'series-stage-'.$index), 0, 120);
            $safe['stageKey'] = mb_substr((string) ($safe['stageKey'] ?? $safe['id']), 0, 120);
            $safe['title'] = mb_substr(trim((string) ($safe['title'] ?? 'مرحله '.($index + 1))), 0, 255);
            $safe['order'] = $index + 1;
            $safe['status'] = $index === 0 ? 'not_started' : 'pending_dependency';
            $safe['relativeDueDays'] = max(0, min(3650, (int) ($safe['relativeDueDays'] ?? $safe['daysFromStart'] ?? 0)));
            $safe['inputs'] = collect($safe['inputs'] ?? [])->filter(fn ($item) => is_array($item))->take(50)
                ->map(fn ($input) => Arr::only($input, ['id', 'title', 'type', 'description', 'isRequired', 'sourceStageId', 'sourceOutputId']))
                ->values()->all();
            $safe['outputs'] = collect($safe['outputs'] ?? [])->filter(fn ($item) => is_array($item))->take(50)
                ->map(fn ($output) => [...Arr::only($output, ['id', 'name', 'type', 'fileType', 'isRequired']), 'isDelivered' => false])
                ->values()->all();
            $safe['checklist'] = collect($safe['checklist'] ?? [])->filter(fn ($item) => is_array($item))->take(100)
                ->map(fn ($item) => ['id' => $item['id'] ?? null, 'text' => mb_substr(trim((string) ($item['text'] ?? '')), 0, 500)])
                ->filter(fn ($item) => $item['text'] !== '')->values()->all();

            return $safe;
        })->all();
    }

    /** @param array<int,mixed> $stages @return array<int,array<string,mixed>> */
    private function templateStages(array $stages): array
    {
        $mapped = collect($stages)->filter(fn ($item) => is_array($item))->values()->map(function (array $stage, int $index): array {
            return [
                ...$stage,
                'id' => 'series-'.($stage['stageKey'] ?? 'stage-'.$index).'-'.$index,
                'assigneeRole' => $stage['defaultRole'] ?? ($stage['assigneeRole'] ?? null),
                'relativeDueDays' => $stage['relativeDueDays'] ?? $stage['daysFromStart'] ?? 0,
            ];
        })->all();

        return $this->safeStages($mapped);
    }

    /** @param array<string,mixed> $payload @return array<string,mixed> */
    private function publicationDefaults(array $payload): array
    {
        $safe = Arr::only($payload, ['date', 'time', 'channels', 'caption', 'status', 'publisherId', 'visibility']);
        $safe['channels'] = collect($safe['channels'] ?? [])->filter(fn ($item) => is_string($item))->map(fn ($channel) => mb_substr($channel, 0, 80))
            ->unique()->take(30)->values()->all();
        $configured = collect(SystemSetting::query()->where('key', 'publishing_platforms')->value('value') ?? [])
            ->filter(fn ($item) => is_array($item) && ! empty($item['id']))->pluck('id')->map(fn ($id) => (string) $id);
        if ($configured->isNotEmpty() && collect($safe['channels'])->contains(fn ($channel) => ! $configured->contains($channel))) {
            throw ValidationException::withMessages(['defaultPublicationConfig.channels' => 'یکی از کانال‌های انتشار انتخاب‌شده معتبر نیست.']);
        }
        $safe['status'] = in_array(($safe['status'] ?? null), ['planned', 'ready'], true) ? $safe['status'] : 'planned';
        $safe['visibility'] = in_array(($safe['visibility'] ?? null), ['public', 'internal', 'restricted'], true)
            ? $safe['visibility'] : 'internal';
        if (isset($safe['caption'])) {
            $safe['caption'] = mb_substr((string) $safe['caption'], 0, 5000);
        }

        return $safe;
    }

    private function fingerprint(array $value): string
    {
        $normalize = function (mixed $item) use (&$normalize): mixed {
            if (! is_array($item)) {
                return $item;
            }
            if (! array_is_list($item)) {
                ksort($item);
            }

            return array_map($normalize, $item);
        };

        return hash('sha256', json_encode($normalize($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
