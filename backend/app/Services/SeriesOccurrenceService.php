<?php

namespace App\Services;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\SeriesBatchRequest;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Deterministic period preview plus lock-protected independent Content creation. */
final class SeriesOccurrenceService
{
    /** @return array<string,mixed> */
    public function preview(ContentSeries $series, ?int $sequence = null): array
    {
        $sequence ??= max(1, (int) ($series->next_sequence_number ?? 1));
        $config = $series->recurrence_config ?? [];
        $interval = max(1, (int) ($config['interval'] ?? 1));
        $anchor = CarbonImmutable::parse($config['startDate'] ?? now()->toDateString())->startOfDay();

        [$date, $periodKey, $periodLabel] = match ($series->recurrence_type) {
            'weekly' => $this->weeklyPeriod($anchor, $sequence, $interval),
            'monthly' => $this->monthlyPeriod($anchor, $sequence, $interval),
            'project_based' => $this->projectPeriod($series, $anchor, $sequence),
            default => [$anchor->addDays($sequence - 1), 'manual-'.$sequence, 'شماره '.$sequence],
        };
        $deadlineOffset = (int) ($config['deadlineOffsetDays'] ?? 0);
        $deadline = $date->addDays($deadlineOffset);

        $latest = $series->contents()->orderByDesc('series_sequence')->first();
        $probe = new Content(['type' => $series->content_type]);
        $proposedCode = app(\App\Support\Content\ContentCodeAllocator::class)->allocateFor($probe, [
            'seriesCode' => $series->code_prefix, 'seriesId' => (string) $series->id,
        ]);
        $stageDeadlines = collect($series->default_content_payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage))
            ->map(fn ($stage) => ['stageId' => $stage['id'] ?? null, 'title' => $stage['title'] ?? '',
                'deadline' => $date->addDays((int) ($stage['relativeDueDays'] ?? $stage['daysFromStart'] ?? $deadlineOffset))->toDateString()])
            ->values()->all();

        return [
            'sequence' => $sequence,
            'periodKey' => $periodKey,
            'periodLabel' => $periodLabel,
            'startDate' => $date->toDateString(),
            'deadline' => $deadline->toDateString(),
            'title' => trim($series->name.' - '.$periodLabel),
            'previous' => $latest ? ['contentId' => (string) $latest->id, 'code' => $latest->code,
                'sequence' => $latest->series_sequence, 'periodKey' => $latest->period_key,
                'deadline' => $latest->deadline?->toDateString()] : null,
            'proposedCode' => $proposedCode,
            'processTemplateId' => $series->process_template_id,
            'projectId' => $series->project_id ? (string) $series->project_id : null,
            'ownerId' => $series->owner_id ? (string) $series->owner_id : null,
            'departmentId' => $series->department_id ? (string) $series->department_id : null,
            'stageDeadlines' => $stageDeadlines,
            'willActivateTasks' => ! $date->isFuture(),
        ];
    }

    /** @return array{0:CarbonImmutable,1:string,2:string} */
    private function weeklyPeriod(CarbonImmutable $anchor, int $sequence, int $interval): array
    {
        $date = $anchor->addWeeks(($sequence - 1) * $interval);
        return [$date, $date->format('o-\WW'), 'هفته '.$date->format('W').' / '.$date->format('Y')];
    }

    /** @return array{0:CarbonImmutable,1:string,2:string} */
    private function monthlyPeriod(CarbonImmutable $anchor, int $sequence, int $interval): array
    {
        $date = $anchor->startOfMonth()->addMonths(($sequence - 1) * $interval);
        return [$date, $date->format('Y-m'), 'ماه '.$date->format('m').' / '.$date->format('Y')];
    }

    /** @return array{0:CarbonImmutable,1:string,2:string} */
    private function projectPeriod(ContentSeries $series, CarbonImmutable $anchor, int $sequence): array
    {
        $date = $sequence === 1 && $series->project?->start_date
            ? CarbonImmutable::parse($series->project->start_date)
            : $anchor->addDays($sequence - 1);
        return [$date, 'project-'.($series->project_id ?: 'none').'-'.$sequence, 'مرحله پروژه '.$sequence];
    }

    public function createNext(User $actor, ContentSeries $series, string $expectedPeriodKey): Content
    {
        return DB::transaction(function () use ($actor, $series, $expectedPeriodKey): Content {
            $series = ContentSeries::with('project')->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($actor, $series), 403);
            if ($existing = Content::where('series_id', $series->id)->where('period_key', $expectedPeriodKey)->first()) {
                return $existing;
            }
            abort_if($series->status !== 'active', 409, 'مجموعه برای ایجاد رخداد باید فعال باشد.');
            $preview = $this->preview($series);
            if (! hash_equals($preview['periodKey'], $expectedPeriodKey)) {
                throw ValidationException::withMessages(['periodKey' => 'دوره بعدی تغییر کرده است؛ پیش‌نمایش را تازه کنید.']);
            }
            $content = $this->createOccurrence($actor, $series, $preview, true);
            $series->update(['next_sequence_number' => $preview['sequence'] + 1]);

            return $content;
        }, 3);
    }

    /**
     * Idempotent as a whole by request key. Future occurrences retain their
     * workflow snapshot but task materialization waits for explicit activation.
     * @return \Illuminate\Support\Collection<int,Content>
     */
    public function createBatch(User $actor, ContentSeries $series, string $requestKey, int $count)
    {
        return DB::transaction(function () use ($actor, $series, $requestKey, $count) {
            $series = ContentSeries::with('project')->whereKey($series->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(SeriesAccess::class)->canEdit($actor, $series), 403);
            abort_if($series->status !== 'active', 409, 'مجموعه برای برنامه‌ریزی باید فعال باشد.');
            if ($saved = SeriesBatchRequest::where('series_id', $series->id)->where('request_key', $requestKey)->first()) {
                return Content::whereIn('id', $saved->content_ids ?? [])->orderBy('series_sequence')->get();
            }
            $batch = SeriesBatchRequest::create(['series_id' => $series->id, 'request_key' => $requestKey, 'content_ids' => []]);
            $contents = collect();
            $next = max(1, (int) ($series->next_sequence_number ?? 1));
            for ($index = 0; $index < $count; $index++) {
                $preview = $this->preview($series, $next + $index);
                $existing = Content::where('series_id', $series->id)->where('period_key', $preview['periodKey'])->first();
                $contents->push($existing ?: $this->createOccurrence($actor, $series, $preview, false));
            }
            $series->update(['next_sequence_number' => $next + $count]);
            $batch->update(['content_ids' => $contents->pluck('id')->all()]);

            return $contents;
        }, 3);
    }

    /** @param array<string,mixed> $period */
    private function createOccurrence(User $actor, ContentSeries $series, array $period, bool $activateNow): Content
    {
        $input = $this->occurrenceInput($series, $period);
        $future = CarbonImmutable::parse($period['startDate'])->isFuture();
        return app(ContentCreator::class)->create($actor, $input, $input, [
            'series_id' => $series->id,
            'series_sequence' => $period['sequence'],
            'period_key' => $period['periodKey'],
            'materialize_tasks' => $activateNow || ! $future,
            'activate_at' => (!$activateNow && $future) ? $period['startDate'] : null,
        ]);
    }

    /** @param array<string,mixed> $period @return array<string,mixed> */
    private function occurrenceInput(ContentSeries $series, array $period): array
    {
        $defaults = $series->default_content_payload ?? [];
        $anchor = CarbonImmutable::parse(($series->recurrence_config ?? [])['startDate'] ?? $period['startDate']);
        $start = CarbonImmutable::parse($period['startDate']);
        $delta = $anchor->diffInDays($start, false);
        $stages = collect($defaults['stages'] ?? [])->map(function ($stage, $index) use ($period, $start, $delta) {
            if (! is_array($stage)) return $stage;
            $relative = $stage['relativeDueDays'] ?? $stage['daysFromStart'] ?? null;
            $stage['id'] = ($stage['id'] ?? 'stage-'.$index).'-occ-'.$period['sequence'];
            if ($relative !== null) {
                $stage['startDate'] = $start->toDateString();
                $stage['deadline'] = $start->addDays((int) $relative)->toDateString();
            } else {
                foreach (['startDate', 'deadline'] as $field) {
                    if (! empty($stage[$field])) $stage[$field] = CarbonImmutable::parse($stage[$field])->addDays($delta)->toDateString();
                }
            }
            return $stage;
        })->all();

        return [
            ...Arr::except($defaults, ['id', 'code', 'title', 'type', 'status', 'ownerId', 'projectId', 'seriesId',
                'seriesSequence', 'periodKey', 'history', 'comments', 'access', 'createdAt', 'updatedAt', '_seriesPlanning']),
            'title' => $period['title'],
            'type' => $series->content_type,
            'status' => 'planning',
            'ownerId' => $series->owner_id,
            'projectId' => $series->project_id,
            'departmentId' => $series->department_id,
            'processTemplateId' => $series->process_template_id,
            'seriesId' => (string) $series->id,
            'seriesCode' => $series->code_prefix,
            'deadline' => $period['deadline'],
            'stages' => $stages,
            'publishInfo' => [...($defaults['publishInfo'] ?? []), ...($series->default_publication_config ?? [])],
        ];
    }
}
