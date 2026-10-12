<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Task;
use App\Models\User;

class ContentStageTaskSync
{
    private const FINISHED_STAGE_STATUSES = ['approved', 'completed', 'skipped'];

    /** @param array<int, array<string, mixed>> $stages */
    public static function dependencyIds(array $stage, int $index, array $stages): array
    {
        if (array_key_exists('dependsOnStageIds', $stage)) {
            $dependencies = is_array($stage['dependsOnStageIds']) ? $stage['dependsOnStageIds'] : [];

            return array_values(array_filter(array_map(
                fn ($id) => is_string($id) || is_int($id) ? trim((string) $id) : '',
                $dependencies,
            ), fn (string $id) => $id !== ''));
        }

        // Backward-compatible interpretation for older content that only stored
        // a sequence of stages and a pending_dependency status.
        $previousId = $index > 0 && is_array($stages[$index - 1] ?? null)
            ? (string) ($stages[$index - 1]['id'] ?? '') : '';

        return $previousId !== '' ? [$previousId] : [];
    }

    /** A stage can start after each dependency is complete or has handed an output to it. */
    public static function dependenciesSatisfied(array $stage, int $index, array $stages): bool
    {
        foreach (self::dependencyIds($stage, $index, $stages) as $dependencyId) {
            $dependency = collect($stages)->first(
                fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === $dependencyId,
            );
            if (! is_array($dependency)) {
                return false;
            }
            $finished = in_array($dependency['status'] ?? '', self::FINISHED_STAGE_STATUSES, true);
            $handedOff = collect($dependency['outputs'] ?? [])->contains(
                fn ($output) => is_array($output) && (string) ($output['forwardedToStageId'] ?? '') === (string) ($stage['id'] ?? ''),
            );
            if (! $finished && ! $handedOff) {
                return false;
            }
        }

        return true;
    }

    /** Derive workflow-level content status without changing persisted dates or publication metadata. */
    public static function derivedContentStatus(?string $currentStatus, array $stages): string
    {
        $stages = collect($stages)->filter(fn ($stage) => is_array($stage));
        if ($stages->isEmpty()) {
            return match ($currentStatus) {
                'in_progress' => 'producing',
                'completed' => 'approved',
                default => (string) ($currentStatus ?: 'idea'),
            };
        }

        $finished = $stages->filter(fn ($stage) => in_array($stage['status'] ?? '', self::FINISHED_STAGE_STATUSES, true))->count();
        $statuses = $stages->pluck('status');

        return match (true) {
            $finished === $stages->count() => 'ready_to_publish',
            $statuses->contains(fn ($value) => in_array($value, ['revisions_needed', 'needs_revision'], true)) => 'revising',
            $statuses->contains(fn ($value) => in_array($value, ['ready_for_review', 'pending_approval'], true)) => 'reviewing',
            $statuses->contains(fn ($value) => in_array($value, ['in_progress', 'ready'], true)) => 'producing',
            default => 'planning',
        };
    }

    public function sync(Content $content): void
    {
        $payload = $content->payload ?? [];
        $stages = is_array($payload['stages'] ?? null) ? array_values($payload['stages']) : [];
        $dependenciesChanged = false;
        // DAGs may contain a dependency whose row appears later. Iterate until a
        // full pass makes no change so one sync reaches a stable state.
        for ($pass = 0; $pass < count($stages); $pass++) {
            $changedThisPass = false;
            foreach ($stages as $index => &$stage) {
                if (! is_array($stage)) {
                    continue;
                }
                if (($stage['reviewRequired'] ?? true) === false
                    && in_array($stage['status'] ?? '', ['pending_approval', 'ready_for_review', 'needs_revision', 'revisions_needed', 'approved'], true)) {
                    $stage['status'] = ($stage['status'] ?? '') === 'approved' ? 'completed' : 'in_progress';
                    $dependenciesChanged = $changedThisPass = true;
                }
                if (in_array($stage['status'] ?? '', ['pending_dependency', 'ready', 'not_started'], true)) {
                    $satisfied = self::dependenciesSatisfied($stage, $index, $stages);
                    if (! $satisfied && ($stage['status'] ?? '') !== 'pending_dependency') {
                        $stage['status'] = 'pending_dependency';
                        $dependenciesChanged = $changedThisPass = true;
                    } elseif ($satisfied && ($stage['status'] ?? '') === 'pending_dependency') {
                        $stage['status'] = 'not_started';
                        $stage['inputs'] = array_map(
                            fn ($input) => is_array($input) ? [...$input, 'isReady' => true] : $input,
                            is_array($stage['inputs'] ?? null) ? $stage['inputs'] : [],
                        );
                        $currentIndex = $payload['currentStageIndex'] ?? null;
                        if (! is_numeric($currentIndex) || (int) $currentIndex > $index) {
                            $payload['currentStageIndex'] = $index;
                        }
                        $dependenciesChanged = $changedThisPass = true;
                    }
                }
            }
            unset($stage);
            if (! $changedThisPass) {
                break;
            }
        }
        unset($stage);
        if ($dependenciesChanged) {
            $payload['stages'] = $stages;
            $content->update(['payload' => $payload]);
        }
        $projectId = $content->project_id;
        $seenKeys = [];

        foreach ($stages as $stage) {
            if (! is_array($stage) || empty($stage['id'])) {
                continue;
            }

            $stageId = (string) $stage['id'];
            if (($stage['stageKey'] ?? null) === 'publish') {
                if (ContentPublication::published($content) || Task::where('content_id', $content->id)->where('content_stage_id', $stageId)
                    ->where('kind', 'content_work')->whereIn('status', ['completed', 'archived'])->exists()) {
                    // Skipping status synchronization is not deletion of a pending review.
                    $seenKeys[] = $this->key($content->id, $stageId, 'content_work');
                    $seenKeys[] = $this->key($content->id, $stageId, 'content_review');

                    continue;
                }
            }
            $status = (string) ($stage['status'] ?? 'not_started');
            $assigneeId = $this->numericId($stage['assigneeId'] ?? null);
            $reviewerId = $this->numericId(
                $stage['reviewerId']
                    ?? $stage['approverId']
                    ?? ($payload['approverId'] ?? null)
                    ?? $content->owner_id
            );

            $workTask = $this->upsertTask(
                $content,
                $stage,
                'content_work',
                $assigneeId,
                $projectId,
                sprintf('مرحله «%s» محتوا: %s', $stage['title'] ?? 'بدون عنوان', $content->title),
                ($stage['reviewRequired'] ?? true) === false
                    ? 'شما مسئول انجام این بخش از پرونده محتوا هستید. این مرحله پس از اتمام، بدون ارزیابی مستقل تکمیل می‌شود.'
                    : 'شما مسئول انجام این بخش از پرونده محتوا هستید. پس از اتمام کار، آن را برای تأیید ارزیاب ارسال کنید.',
            );
            $seenKeys[] = $this->key($content->id, $stageId, 'content_work');
            $this->applyWorkStatus($workTask, $status, $assigneeId);

            $needsReview = ($stage['reviewRequired'] ?? true) !== false
                && in_array($status, ['pending_approval', 'ready_for_review'], true);
            if ($needsReview && $reviewerId) {
                $reviewTask = $this->upsertTask(
                    $content,
                    $stage,
                    'content_review',
                    $reviewerId,
                    $projectId,
                    sprintf('تأیید ارزیاب «%s»: %s', $stage['title'] ?? 'بدون عنوان', $content->title),
                    'مسئول مرحله کار را انجام داده است. این تسک برای بررسی و تأیید ارزیاب ایجاد شده است.',
                );
                if (! in_array($reviewTask->status, ['completed', 'archived'], true)) {
                    $reviewTask->update([
                        'status' => 'backlog',
                        'assignee_id' => $reviewerId,
                    ]);
                }
                $seenKeys[] = $this->key($content->id, $stageId, 'content_review');
            }

            if (in_array($status, ['approved', 'completed'], true)) {
                Task::query()
                    ->where('content_id', $content->id)
                    ->where('content_stage_id', $stageId)
                    ->whereIn('kind', ['content_work', 'content_review', 'content_correction'])
                    ->whereNotIn('status', ['completed', 'archived'])
                    ->update(['status' => 'completed']);
            }

            if ($status === 'needs_revision' || $status === 'revisions_needed') {
                Task::query()
                    ->where('content_id', $content->id)
                    ->where('content_stage_id', $stageId)
                    ->where('kind', 'content_review')
                    ->whereNotIn('status', ['completed', 'archived'])
                    ->update(['status' => 'completed']);

            }
        }

        app(ContentPublication::class)->ensureAutomaticTask($content->refresh());
        $this->pruneObsoleteTasks($content->id, $seenKeys);
        $this->syncContentState($content->refresh());
    }

    private function syncContentState(Content $content): void
    {
        $payload = $content->payload ?? [];
        $stages = collect($payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage))->values();
        $finished = $stages->filter(fn ($stage) => in_array($stage['status'] ?? '', self::FINISHED_STAGE_STATUSES, true))->count();
        $payload['progress'] = $stages->isEmpty() ? 0 : (int) round(($finished / $stages->count()) * 100);

        if (! in_array($content->status, ['published', 'archived', 'cancelled', 'suspended'], true)) {
            $status = self::derivedContentStatus($content->status, $stages->all());
            $content->status = $status;
            $payload['status'] = $status;
        }

        $content->payload = $payload;
        if ($content->isDirty(['status', 'payload'])) {
            $content->save();
        }
    }

    /**
     * @param  array<string, mixed>  $stage
     */
    private function upsertTask(
        Content $content,
        array $stage,
        string $kind,
        ?int $assigneeId,
        ?int $projectId,
        string $title,
        string $description,
    ): Task {
        $assigneeId = $assigneeId && User::query()->whereKey($assigneeId)->exists() ? $assigneeId : null;

        $cycle = $kind === 'content_review' ? ($stage['_reviewDecision']['id'] ?? null) : null;
        $sourceKey = $cycle ? hash('sha256', 'review:'.$content->id.':'.$stage['id'].':'.$cycle) : null;
        $existing = Task::where('content_id', $content->id)->where('content_stage_id', (string) $stage['id'])
            ->where('kind', $kind)->where('source_key', $sourceKey)->first();
        if ($existing && in_array($existing->status, ['completed', 'archived'], true)) {
            return $existing;
        }

        $task = Task::query()->updateOrCreate(
            [
                'content_id' => $content->id,
                'content_stage_id' => (string) $stage['id'],
                'kind' => $kind,
                'source_key' => $sourceKey,
            ],
            [
                'title' => $title,
                'description' => $description,
                'project_id' => $projectId,
                'assignee_id' => $assigneeId,
                'priority' => $kind === 'content_review' ? 'high' : 'medium',
                'start_date' => $stage['startDate'] ?? now()->toDateString(),
                'deadline' => $stage['deadline'] ?? $content->deadline?->toDateString(),
                'tags' => array_values(array_filter([
                    'محتوا',
                    $kind === 'content_review' ? 'تأیید ارزیاب' : 'مرحله تولید',
                    $stage['title'] ?? null,
                ])),
            ],
        );
        if ($task->wasRecentlyCreated || (string) $existing?->assignee_id !== (string) $task->assignee_id) {
            app(TaskAssignmentNotifications::class)->created($task);
        }

        return $task;
    }

    private function applyWorkStatus(Task $task, string $stageStatus, ?int $assigneeId): void
    {
        if (in_array($stageStatus, ['needs_revision', 'revisions_needed'], true)) {
            return;
        } // Rejection never reopens prior work.
        if (in_array($task->status, ['completed', 'archived'], true)) {
            return;
        }
        $status = match ($stageStatus) {
            'in_progress', 'needs_revision', 'revisions_needed' => 'in_progress',
            'pending_approval', 'ready_for_review' => 'review',
            'approved', 'completed' => 'completed',
            'skipped' => 'completed',
            default => 'backlog',
        };

        $task->update([
            'status' => $status,
            'assignee_id' => $assigneeId ?? $task->assignee_id,
        ]);
    }

    /**
     * @param  array<int, string>  $seenKeys
     */
    private function pruneObsoleteTasks(int $contentId, array $seenKeys): void
    {
        Task::query()
            ->where('content_id', $contentId)
            ->whereIn('kind', ['content_work', 'content_review'])
            ->whereNotIn('status', ['completed', 'archived'])
            ->get()
            ->each(function (Task $task) use ($seenKeys): void {
                $key = $this->key((int) $task->content_id, (string) $task->content_stage_id, (string) $task->kind);
                if (! in_array($key, $seenKeys, true) && $task->kind === 'content_review') {
                    $task->update(['status' => 'archived']);
                }
            });
    }

    private function key(int $contentId, string $stageId, string $kind): string
    {
        return "{$contentId}:{$stageId}:{$kind}";
    }

    private function numericId(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && ctype_digit($value)) {
            return (int) $value;
        }

        return null;
    }
}
