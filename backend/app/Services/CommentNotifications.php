<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/** Persist collaboration notifications only for users directly related to the subject. */
final class CommentNotifications
{
    public function created(Comment $comment, User $actor): void
    {
        $recipients = match ($comment->subject_type) {
            'task' => $this->taskRecipients((int) $comment->subject_id),
            'content' => $this->contentRecipients((int) $comment->subject_id),
            default => [],
        };
        $recipients = array_values(array_unique(array_filter($recipients, fn ($id) => is_numeric($id) && (int) $id !== (int) $actor->id)));
        if ($recipients === []) {
            return;
        }

        $subject = $comment->subject_type === 'task'
            ? Task::query()->find($comment->subject_id)?->title
            : Content::query()->find($comment->subject_id)?->title;
        $link = $comment->subject_type === 'task'
            ? ['linkTaskId' => (string) $comment->subject_id]
            : ['linkContentId' => (string) $comment->subject_id];
        $type = $comment->parent_id ? 'reply' : 'comment';
        $title = $comment->parent_id ? 'پاسخ جدید به دیدگاه' : 'دیدگاه جدید';

        foreach (User::query()->whereIn('id', $recipients)->where('status', 'active')->get() as $recipient) {
            $attributes = [
                'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                'user_id' => $recipient->id,
                'title' => $title,
                'payload' => [
                    'userId' => (string) $recipient->id,
                    'title' => $title,
                    'message' => $actor->name.' در «'.($subject ?: 'مورد مرتبط').'» دیدگاه ثبت کرد: '.mb_substr($comment->body, 0, 220),
                    'type' => $type,
                    'notificationCategory' => 'collaboration',
                    ...$link,
                    'read' => false,
                    'timestamp' => now()->toIso8601String(),
                ],
            ];
            if (Schema::hasColumn('domain_records', 'notification_key')) {
                DomainRecord::firstOrCreate([
                    'notification_key' => hash('sha256', 'comment:'.$comment->id.':'.$recipient->id),
                ], $attributes);
            } else {
                DomainRecord::create($attributes);
            }
        }
    }

    /** @return array<int, int|string|null> */
    private function taskRecipients(int $taskId): array
    {
        $task = Task::query()->find($taskId);

        return $task ? [$task->assignee_id] : [];
    }

    /** @return array<int, int|string|null> */
    private function contentRecipients(int $contentId): array
    {
        $content = Content::query()->find($contentId);
        if (! $content) {
            return [];
        }
        $payload = $content->payload ?? [];
        $ids = [$content->owner_id];
        foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $key) {
            array_push($ids, ...(array) ($payload[$key] ?? []));
        }
        foreach (['creatorId', 'approverId', 'publisherId'] as $key) {
            $ids[] = $payload[$key] ?? null;
        }
        foreach ((array) ($payload['stages'] ?? []) as $stage) {
            if (is_array($stage)) {
                array_push($ids, $stage['assigneeId'] ?? null, $stage['reviewerId'] ?? null, $stage['approverId'] ?? null);
            }
        }

        return $ids;
    }
}
