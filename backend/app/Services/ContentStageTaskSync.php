<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Task;
use App\Models\User;

class ContentStageTaskSync
{
    public function sync(Content $content): void
    {
        $payload = $content->payload ?? [];
        $stages = is_array($payload['stages'] ?? null) ? $payload['stages'] : [];
        $projectId = $content->project_id;
        $seenKeys = [];

        foreach ($stages as $stage) {
            if (! is_array($stage) || empty($stage['id'])) {
                continue;
            }

            $stageId = (string) $stage['id'];
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
                'شما مسئول انجام این بخش از پرونده محتوا هستید. پس از اتمام کار، آن را برای تأیید ارزیاب ارسال کنید.',
            );
            $seenKeys[] = $this->key($content->id, $stageId, 'content_work');
            $this->applyWorkStatus($workTask, $status, $assigneeId);

            $needsReview = in_array($status, ['pending_approval', 'ready_for_review'], true);
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
                $reviewTask->update([
                    'status' => 'todo',
                    'assignee_id' => $reviewerId,
                ]);
                $seenKeys[] = $this->key($content->id, $stageId, 'content_review');
            }

            if (in_array($status, ['approved', 'completed'], true)) {
                Task::query()
                    ->where('content_id', $content->id)
                    ->where('content_stage_id', $stageId)
                    ->whereIn('kind', ['content_work', 'content_review'])
                    ->update(['status' => 'completed']);
            }

            if ($status === 'needs_revision' || $status === 'revisions_needed') {
                Task::query()
                    ->where('content_id', $content->id)
                    ->where('content_stage_id', $stageId)
                    ->where('kind', 'content_review')
                    ->update(['status' => 'completed']);
                Task::query()
                    ->where('content_id', $content->id)
                    ->where('content_stage_id', $stageId)
                    ->where('kind', 'content_work')
                    ->update(['status' => 'in_progress']);
            }
        }

        $this->pruneObsoleteTasks($content->id, $seenKeys);
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

        return Task::query()->updateOrCreate(
            [
                'content_id' => $content->id,
                'content_stage_id' => (string) $stage['id'],
                'kind' => $kind,
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
    }

    private function applyWorkStatus(Task $task, string $stageStatus, ?int $assigneeId): void
    {
        $status = match ($stageStatus) {
            'in_progress', 'needs_revision', 'revisions_needed' => 'in_progress',
            'pending_approval', 'ready_for_review' => 'review',
            'approved', 'completed' => 'completed',
            'skipped' => 'completed',
            default => $assigneeId ? 'todo' : 'backlog',
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
            ->get()
            ->each(function (Task $task) use ($seenKeys): void {
                $key = $this->key((int) $task->content_id, (string) $task->content_stage_id, (string) $task->kind);
                if (! in_array($key, $seenKeys, true) && $task->kind === 'content_review') {
                    $task->delete();
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
