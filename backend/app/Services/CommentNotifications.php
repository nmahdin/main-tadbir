<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\Content;
use App\Models\ContentWatcher;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Collaboration notifications for new comments.
 *
 * Recipients are always derived from real relations of the subject:
 *  - a task comment reaches the task assignee, the owner of the content the task
 *    belongs to, that content's members and its watchers;
 *  - a content comment reaches every member of the content (owner, collaborators,
 *    stage assignees/reviewers, watchers);
 *  - a reply additionally reaches the author being answered and the other
 *    participants of the same discussion thread.
 *
 * Nothing is broadcast organisation-wide and the actor never notifies themselves.
 */
final class CommentNotifications
{
    /** Upper bound on recipients per comment, to keep one comment from flooding the inbox. */
    private const MAX_RECIPIENTS = 60;

    public function created(Comment $comment, User $actor): void
    {
        $recipients = match ($comment->subject_type) {
            'task' => $this->taskRecipients((int) $comment->subject_id),
            'content' => $this->contentRecipients((int) $comment->subject_id),
            'idea', 'asset' => $this->threadRecipients($comment, (int) $comment->subject_id),
            default => [],
        };

        // A reply is directed at a specific person: they must hear about it even when
        // they hold no role on the subject itself.
        if ($comment->parent_id) {
            $parentAuthor = Comment::query()->whereKey($comment->parent_id)->value('user_id');
            if ($parentAuthor) {
                $recipients[] = $parentAuthor;
            }
        }

        $recipients = array_values(array_unique(array_filter(
            $recipients,
            fn ($id) => is_numeric($id) && (int) $id !== (int) $actor->id,
        )));
        if ($recipients === []) {
            return;
        }
        $recipients = array_slice($recipients, 0, self::MAX_RECIPIENTS);

        $subject = match ($comment->subject_type) {
            'task' => Task::query()->find($comment->subject_id)?->title,
            'content' => Content::query()->find($comment->subject_id)?->title,
            default => null,
        };
        $link = match ($comment->subject_type) {
            'task' => ['linkTaskId' => (string) $comment->subject_id],
            'content' => ['linkContentId' => (string) $comment->subject_id],
            default => [],
        };
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
        if (! $task) {
            return [];
        }

        $ids = [$task->assignee_id];
        if ($task->content_id) {
            // Stage work happens inside a content file: its members are the team the
            // assignee coordinates with, so they belong on the task conversation too.
            array_push($ids, ...$this->contentRecipients((int) $task->content_id));
        }

        return $ids;
    }

    /** @return array<int, int|string|null> */
    private function contentRecipients(int $contentId): array
    {
        $content = Content::query()->find($contentId);
        if (! $content) {
            return [];
        }

        return [
            $content->owner_id,
            ...$this->payloadMemberIds($content),
            ...$this->stageParticipantIds($content),
            ...$this->watcherIds($content->id),
        ];
    }

    /** @return array<int, int|string|null> */
    private function payloadMemberIds(Content $content): array
    {
        $payload = $content->payload ?? [];
        $ids = [];
        foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $key) {
            array_push($ids, ...(array) ($payload[$key] ?? []));
        }
        foreach (['creatorId', 'approverId', 'publisherId'] as $key) {
            $ids[] = $payload[$key] ?? null;
        }

        return $ids;
    }

    /** @return array<int, int|string|null> */
    private function stageParticipantIds(Content $content): array
    {
        $payload = $content->payload ?? [];
        $ids = [];
        foreach ((array) ($payload['stages'] ?? []) as $stage) {
            if (is_array($stage)) {
                array_push($ids, $stage['assigneeId'] ?? null, $stage['reviewerId'] ?? null, $stage['approverId'] ?? null);
            }
        }

        return $ids;
    }

    /** @return array<int, int|string|null> */
    private function watcherIds(int $contentId): array
    {
        if (! Schema::hasTable('content_watchers')) {
            return [];
        }

        return ContentWatcher::query()->where('content_id', $contentId)->pluck('user_id')->all();
    }

    /** @return array<int, int|string|null> */
    private function threadRecipients(Comment $comment, int $subjectId): array
    {
        return Comment::query()
            ->where('subject_type', $comment->subject_type)
            ->where('subject_id', $subjectId)
            ->pluck('user_id')
            ->all();
    }
}
