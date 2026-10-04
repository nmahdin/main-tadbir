<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Overdue reminders that are safe to run as often as the host allows.
 *
 * The runner is idempotent: every reminder carries a stable `notification_key`
 * derived from the deadline and the recipient, so a second, third or hundredth
 * run never produces a duplicate. The original deadline of a task or content is
 * never changed by this service. Nothing here needs a queue worker, a daemon
 * or a permanent cron: an external scheduler, the existing Bale tick or an
 * administrator can all call it, and the result is the same.
 */
final class OverdueNotifications
{
    /**
     * @return array{scanned:int, reminders:int, recipients:list<int>}
     */
    public function run(?Carbon $now = null): array
    {
        if (! Schema::hasColumn('domain_records', 'notification_key')) {
            return ['scanned' => 0, 'reminders' => 0, 'recipients' => []];
        }

        $now ??= Carbon::now();
        $recipients = [];
        $scanned = 0;

        foreach ($this->overdueTasks($now) as $task) {
            $scanned++;
            foreach ($this->taskRecipients($task) as $recipient) {
                if ($this->remind(
                    'task:'.$task->id.':'.$this->stamp($task->deadline),
                    $recipient,
                    'تأخیر در وظیفه',
                    sprintf('مهلت وظیفهٔ «%s» گذشته است و اکنون در وضعیت تأخیر است.', (string) $task->title),
                    array_filter([
                        'linkTaskId' => (string) $task->id,
                        'linkContentId' => $task->content_id ? (string) $task->content_id : null,
                        'taskKind' => (string) $task->kind,
                        'deadline' => $this->stamp($task->deadline),
                    ], fn ($value) => $value !== null),
                )) {
                    $recipients[] = $recipient->id;
                }
            }
        }

        foreach ($this->overdueContents($now) as $content) {
            $scanned++;
            $owner = $content->owner_id ? User::find($content->owner_id) : null;
            foreach ($this->recipients($content->owner_id, null) as $recipient) {
                if ($this->remind(
                    'content:'.$content->id.':'.$this->stamp($content->deadline),
                    $recipient,
                    'تأخیر در محتوا',
                    sprintf('مهلت محتوای «%s» گذشته است و اکنون در وضعیت تأخیر است.', (string) $content->title),
                    ['linkContentId' => (string) $content->id, 'deadline' => $this->stamp($content->deadline)],
                )) {
                    $recipients[] = $recipient->id;
                }
            }
        }

        return ['scanned' => $scanned, 'reminders' => count($recipients), 'recipients' => $recipients];
    }

    /** Overdue, unfinished work. The deadline column itself is only read. */
    private function overdueTasks(Carbon $now)
    {
        return Task::query()
            ->with(['project', 'content'])
            ->whereNotNull('deadline')
            ->where('deadline', '<', $now)
            ->whereNotIn('status', ['completed', 'archived'])
            // Workflow tasks use their own deadline just like ordinary tasks.
            // content_work/review/correction/publish must never be excluded merely
            // because content_id is populated.
            ->get();
    }

    private function overdueContents(Carbon $now)
    {
        return Content::query()
            ->whereNotNull('deadline')
            ->where('deadline', '<', $now)
            ->whereNotIn('status', ['published', 'archived', 'cancelled', 'suspended'])
            ->get();
    }

    /** @return list<User> */
    private function taskRecipients(Task $task): array
    {
        $managerId = $task->project?->project_manager_id;
        $ownerId = null;
        $departmentManagerId = null;
        $policy = $task->content?->payload['overduePolicy'] ?? [];
        if (is_array($policy) && ($policy['notifyOwner'] ?? false) === true) {
            $ownerId = $task->content?->owner_id;
        }
        if (is_array($policy) && ($policy['notifyDepartmentManager'] ?? false) === true && $task->content && $task->content_stage_id) {
            $stage = collect($task->content->payload['stages'] ?? [])->first(
                fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === (string) $task->content_stage_id,
            );
            if (is_array($stage) && ! empty($stage['departmentId'])) {
                $departmentManagerId = Department::query()->whereKey($stage['departmentId'])->value('manager_id');
            }
        }

        return $this->recipients($task->assignee_id, $managerId, $ownerId, $departmentManagerId);
    }

    /** @return list<User> */
    private function recipients(?int ...$ids): array
    {
        $seen = [];
        $result = [];
        foreach (array_filter($ids) as $id) {
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $user = User::find($id);
            if ($user?->isActive()) {
                $result[] = $user;
            }
        }

        return $result;
    }

    /** @param array<string, string> $links */
    private function remind(string $subject, User $recipient, string $title, string $message, array $links): bool
    {
        $attributes = [
            'domain' => DomainRecord::DOMAIN_NOTIFICATION,
            'user_id' => $recipient->id,
            'title' => $title,
            'payload' => [
                'userId' => (string) $recipient->id,
                'title' => $title,
                'message' => $message,
                'type' => 'overdue',
                'notificationCategory' => 'tasks',
                'read' => false,
                'timestamp' => now()->toIso8601String(),
                ...$links,
            ],
        ];

        return DomainRecord::firstOrCreate(
            ['notification_key' => hash('sha256', 'overdue:'.$subject.':'.$recipient->id)],
            $attributes,
        )->wasRecentlyCreated;
    }

    private function stamp(mixed $deadline): string
    {
        return $deadline instanceof Carbon ? $deadline->toDateString() : (string) $deadline;
    }
}
