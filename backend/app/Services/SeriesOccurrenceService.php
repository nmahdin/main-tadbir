<?php

namespace App\Services;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\ProjectContentPlan;
use App\Models\SeriesBatchRequest;
use App\Models\User;
use App\Support\Calendar\PersianCalendar;
use App\Support\Content\ContentCodeAllocator;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Deterministic schedule preview plus lock-protected independent Content creation. */
final class SeriesOccurrenceService
{
    /** @return array<string,mixed> */
    public function preview(ContentSeries $series, ?int $sequence = null): array
    {
        $sequence ??= max(1, (int) ($series->next_sequence_number ?? 1));
        $configuration = app(SeriesConfigurationService::class)->effective($series);
        $config = $configuration['recurrenceConfig'];
        $interval = max(1, (int) ($config['interval'] ?? 1));
        $anchor = CarbonImmutable::parse($config['startDate'] ?? now()->toDateString())->startOfDay();
        $recurrenceType = (string) $configuration['recurrenceType'];

        [$date, $periodKey, $periodLabel] = match ($recurrenceType) {
            'weekly' => $this->weeklyPeriod($anchor, $sequence, $interval),
            'monthly' => $this->monthlyPeriod($anchor, $sequence, $interval, $config),
            'project_based' => $this->projectPeriod($series, $configuration, $anchor, $sequence, $interval),
            default => [$anchor->addDays($sequence - 1), 'manual-'.$sequence, 'شماره '.$sequence],
        };
        $deadlineOffset = (int) ($config['deadlineOffsetDays'] ?? 0);
        $deadline = $date->addDays($deadlineOffset);

        $latest = $series->contents()->orderByDesc('series_sequence')->first();
        $probe = new Content(['type' => $configuration['contentType']]);
        $proposedCode = app(ContentCodeAllocator::class)->allocateFor($probe, [
            'seriesCode' => $series->code_prefix, 'seriesId' => (string) $series->id,
        ]);
        $stageDeadlines = collect($configuration['defaultContentPayload']['stages'] ?? [])->filter(fn ($item) => is_array($item))
            ->map(fn ($stage) => [
                'stageId' => $stage['id'] ?? null,
                'title' => $stage['title'] ?? '',
                'deadline' => $date->addDays((int) ($stage['relativeDueDays'] ?? $stage['daysFromStart'] ?? $deadlineOffset))->toDateString(),
            ])->values()->all();

        return [
            'sequence' => $sequence,
            'periodKey' => $periodKey,
            'periodLabel' => $periodLabel,
            'startDate' => $date->toDateString(),
            'deadline' => $deadline->toDateString(),
            'title' => trim($series->name.' - '.$periodLabel),
            'previous' => $latest ? [
                'contentId' => (string) $latest->id, 'code' => $latest->code,
                'sequence' => $latest->series_sequence, 'periodKey' => $latest->period_key,
                'deadline' => $latest->deadline?->toDateString(),
            ] : null,
            'proposedCode' => $proposedCode,
            'processTemplateId' => $configuration['processTemplateId'],
            'revisionId' => $configuration['id'] ? (string) $configuration['id'] : null,
            'revisionVersion' => (int) $configuration['version'],
            'projectId' => $series->project_id ? (string) $series->project_id : null,
            'ownerId' => $series->owner_id ? (string) $series->owner_id : null,
            'departmentId' => $series->department_id ? (string) $series->department_id : null,
            'stageDeadlines' => $stageDeadlines,
            'willActivateTasks' => ! $this->activationAt($date, $config)->isFuture(),
            'requiresManualDates' => $recurrenceType === 'manual',
            'calendar' => $config['calendar'] ?? 'jalali',
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public function previewRange(ContentSeries $series, int $count = 6): array
    {
        $count = max(1, min(24, $count));
        $next = max(1, (int) ($series->next_sequence_number ?? 1));

        return collect(range($next, $next + $count - 1))
            ->map(fn (int $sequence) => $this->preview($series, $sequence))->all();
    }

    /** @return array{0:CarbonImmutable,1:string,2:string} */
    private function weeklyPeriod(CarbonImmutable $anchor, int $sequence, int $interval): array
    {
        $date = $anchor->addWeeks(($sequence - 1) * $interval);

        return [$date, $date->format('o-\WW'), 'هفته '.$date->format('W').' / '.$date->format('Y')];
    }

    /** @param array<string,mixed> $config @return array{0:CarbonImmutable,1:string,2:string} */
    private function monthlyPeriod(CarbonImmutable $anchor, int $sequence, int $interval, array $config): array
    {
        $months = ($sequence - 1) * $interval;
        $preferredDay = (int) ($config['dayOfMonth'] ?? 0) ?: null;
        if (($config['calendar'] ?? 'jalali') === 'jalali') {
            $date = app(PersianCalendar::class)->addMonths($anchor, $months, $preferredDay);
            $jalali = app(PersianCalendar::class)->fromGregorian($date);
            $label = 'ماه '.str_pad((string) $jalali['month'], 2, '0', STR_PAD_LEFT).' / '.$jalali['year'];
        } else {
            $target = $anchor->startOfMonth()->addMonths($months);
            $day = min($preferredDay ?? $anchor->day, $target->daysInMonth);
            $date = $target->day($day);
            $label = 'ماه '.$date->format('m').' / '.$date->format('Y');
        }

        return [$date, $date->format('Y-m'), $label];
    }

    /** @param array<string,mixed> $configuration @return array{0:CarbonImmutable,1:string,2:string} */
    private function projectPeriod(ContentSeries $series, array $configuration, CarbonImmutable $anchor, int $sequence, int $interval): array
    {
        $project = $series->project;
        $start = $project?->start_date ? CarbonImmutable::parse($project->start_date) : $anchor;
        $plan = $project ? ProjectContentPlan::query()
            ->where('project_id', $project->id)
            ->where('content_type', $configuration['contentType'])
            ->first() : null;
        $deadlineValue = $plan?->deadline ?? $project?->deadline;
        $deadline = $deadlineValue ? CarbonImmutable::parse($deadlineValue) : null;
        $slots = max(1, (int) ($plan?->planned_count ?? 1));
        if ($deadline && $slots > 1 && $sequence <= $slots) {
            $duration = max(0, $start->diffInDays($deadline, false));
            $date = $start->addDays((int) round(($sequence - 1) * $duration / ($slots - 1)));
        } elseif ($deadline && $sequence > $slots) {
            $date = $deadline->addDays(($sequence - $slots) * $interval);
        } else {
            $date = $start->addDays(($sequence - 1) * $interval);
        }

        return [$date, 'project-'.($series->project_id ?: 'none').'-'.$sequence, 'برنامه پروژه '.$sequence];
    }

    /** @param array<string,mixed> $overrides */
    public function createNext(
        User $actor,
        ContentSeries $series,
        string $expectedPeriodKey,
        array $overrides = [],
        ?int $expectedVersion = null,
        ?string $requestKey = null,
    ): Content {
        return DB::transaction(function () use ($actor, $series, $expectedPeriodKey, $overrides, $expectedVersion, $requestKey): Content {
            $series = ContentSeries::with(['project', 'currentRevision'])->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($actor, $series), 403);
            if ($requestKey && ($saved = SeriesBatchRequest::where('series_id', $series->id)->where('request_key', $requestKey)->first())) {
                return Content::whereKey(collect($saved->content_ids ?? [])->first())->firstOrFail();
            }
            if ($existing = Content::where('series_id', $series->id)->where('period_key', $expectedPeriodKey)->first()) {
                return $existing;
            }
            $this->guardVersion($series, $expectedVersion);
            abort_if($series->status !== 'active', 409, 'مجموعه برای ایجاد رخداد باید فعال باشد.');
            $preview = $this->preview($series);
            if (! hash_equals($preview['periodKey'], $expectedPeriodKey)) {
                throw ValidationException::withMessages(['periodKey' => 'دوره بعدی تغییر کرده است؛ پیش‌نمایش را تازه کنید.']);
            }
            $preview = $this->applyOverrides($series, $preview, $overrides);
            $content = $this->createOccurrence($actor, $series, $preview, true);
            $series->update([
                'next_sequence_number' => $preview['sequence'] + 1,
                'lock_version' => (int) $series->lock_version + 1,
            ]);
            if ($requestKey) {
                SeriesBatchRequest::create([
                    'series_id' => $series->id,
                    'request_key' => $requestKey,
                    'content_ids' => [$content->id],
                ]);
            }

            return $content;
        }, 3);
    }

    /**
     * The request key identifies the user operation across lost responses and
     * manual retries. Every resulting occurrence remains an independent Content.
     *
     * @return Collection<int,Content>
     */
    public function createBatch(
        User $actor,
        ContentSeries $series,
        string $requestKey,
        int $count,
        ?int $expectedVersion = null,
    ) {
        return DB::transaction(function () use ($actor, $series, $requestKey, $count, $expectedVersion) {
            $series = ContentSeries::with(['project', 'currentRevision'])->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($actor, $series), 403);
            if ($saved = SeriesBatchRequest::where('series_id', $series->id)->where('request_key', $requestKey)->first()) {
                return Content::whereIn('id', $saved->content_ids ?? [])->orderBy('series_sequence')->get();
            }
            $this->guardVersion($series, $expectedVersion);
            abort_if($series->status !== 'active', 409, 'مجموعه برای برنامه‌ریزی باید فعال باشد.');
            $batch = SeriesBatchRequest::create(['series_id' => $series->id, 'request_key' => $requestKey, 'content_ids' => []]);
            $contents = collect();
            $next = max(1, (int) ($series->next_sequence_number ?? 1));
            for ($index = 0; $index < $count; $index++) {
                $preview = $this->preview($series, $next + $index);
                $existing = Content::where('series_id', $series->id)->where('period_key', $preview['periodKey'])->first();
                $contents->push($existing ?: $this->createOccurrence($actor, $series, $preview, false));
            }
            $series->update([
                'next_sequence_number' => $next + $count,
                'lock_version' => (int) $series->lock_version + 1,
            ]);
            $batch->update(['content_ids' => $contents->pluck('id')->all()]);

            return $contents;
        }, 3);
    }

    /** @param array<string,mixed> $period */
    private function createOccurrence(User $actor, ContentSeries $series, array $period, bool $activateNow): Content
    {
        $input = $this->occurrenceInput($series, $period);
        $configuration = app(SeriesConfigurationService::class)->effective($series);
        $activationAt = $this->activationAt(CarbonImmutable::parse($period['startDate']), $configuration['recurrenceConfig']);
        $future = $activationAt->isFuture();
        $materialize = $activateNow || ! $future;

        return app(ContentCreator::class)->create($actor, $input, $input, [
            'series_id' => $series->id,
            'series_revision_id' => $configuration['id'],
            'series_sequence' => $period['sequence'],
            'period_key' => $period['periodKey'],
            'planned_start_at' => $activationAt->toDateTimeString(),
            'materialize_tasks' => $materialize,
            'activate_at' => (! $materialize && $future) ? $activationAt->toIso8601String() : null,
        ]);
    }

    /** @param array<string,mixed> $period @return array<string,mixed> */
    private function occurrenceInput(ContentSeries $series, array $period): array
    {
        $configuration = app(SeriesConfigurationService::class)->effective($series);
        $defaults = $configuration['defaultContentPayload'];
        $anchor = CarbonImmutable::parse(($configuration['recurrenceConfig'] ?? [])['startDate'] ?? $period['startDate']);
        $start = CarbonImmutable::parse($period['startDate']);
        $delta = $anchor->diffInDays($start, false);
        $stages = collect($defaults['stages'] ?? [])->map(function ($stage, $index) use ($period, $start, $delta) {
            if (! is_array($stage)) {
                return $stage;
            }
            $relative = $stage['relativeDueDays'] ?? $stage['daysFromStart'] ?? null;
            $stage['id'] = ($stage['id'] ?? 'stage-'.$index).'-occ-'.$period['sequence'];
            $stage['status'] = $index === 0 ? 'not_started' : 'pending_dependency';
            if ($relative !== null) {
                $stage['startDate'] = $start->toDateString();
                $stage['deadline'] = $start->addDays((int) $relative)->toDateString();
            } else {
                foreach (['startDate', 'deadline'] as $field) {
                    if (! empty($stage[$field])) {
                        $stage[$field] = CarbonImmutable::parse($stage[$field])->addDays($delta)->toDateString();
                    }
                }
            }

            return $stage;
        })->all();

        return [
            ...Arr::except($defaults, [
                'id', 'code', 'title', 'type', 'status', 'ownerId', 'projectId', 'seriesId',
                'seriesSequence', 'periodKey', 'history', 'comments', 'access', 'createdAt', 'updatedAt', '_seriesPlanning',
            ]),
            'title' => $period['title'],
            'type' => $configuration['contentType'],
            'status' => 'planning',
            'ownerId' => $series->owner_id,
            'projectId' => $series->project_id,
            'departmentId' => $series->department_id,
            'processTemplateId' => $configuration['processTemplateId'],
            'seriesId' => (string) $series->id,
            'seriesCode' => $series->code_prefix,
            'seriesRevisionId' => $configuration['id'] ? (string) $configuration['id'] : null,
            'seriesRevisionVersion' => $configuration['version'],
            'deadline' => $period['deadline'],
            'stages' => $stages,
            'publishInfo' => [...($defaults['publishInfo'] ?? []), ...$configuration['defaultPublicationConfig']],
        ];
    }

    /** @param array<string,mixed> $preview @param array<string,mixed> $overrides @return array<string,mixed> */
    private function applyOverrides(ContentSeries $series, array $preview, array $overrides): array
    {
        if ($series->recurrence_type !== 'manual' || $overrides === []) {
            return $preview;
        }
        if (! empty($overrides['startDate'])) {
            $preview['startDate'] = CarbonImmutable::parse($overrides['startDate'])->toDateString();
        }
        if (! empty($overrides['deadline'])) {
            $preview['deadline'] = CarbonImmutable::parse($overrides['deadline'])->toDateString();
        }
        if (isset($overrides['title']) && trim((string) $overrides['title']) !== '') {
            $preview['title'] = mb_substr(trim((string) $overrides['title']), 0, 255);
        }
        abort_if(CarbonImmutable::parse($preview['deadline'])->lt(CarbonImmutable::parse($preview['startDate'])), 422,
            'مهلت رخداد دستی نمی‌تواند پیش از تاریخ شروع باشد.');

        return $preview;
    }

    /** @param array<string,mixed> $config */
    private function activationAt(CarbonImmutable $date, array $config): CarbonImmutable
    {
        $time = preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d$/', (string) ($config['activationTime'] ?? '')) === 1
            ? (string) $config['activationTime'] : '00:00';
        [$hour, $minute] = array_map('intval', explode(':', $time));

        return $date->startOfDay()->setTime($hour, $minute);
    }

    private function guardVersion(ContentSeries $series, ?int $expectedVersion): void
    {
        if ($expectedVersion !== null) {
            abort_unless((int) $series->lock_version === $expectedVersion, 409,
                'تنظیمات مجموعه تغییر کرده است؛ پیش‌نمایش را تازه و دوباره بررسی کنید.');
        }
    }
}
