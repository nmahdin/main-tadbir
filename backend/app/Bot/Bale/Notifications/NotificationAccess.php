<?php

namespace App\Bot\Bale\Notifications;

use App\Bot\Bale\Meetings\MeetingReminders;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\Access\UserPermissionGate;
use App\Services\ContentAccess;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class NotificationAccess
{
    public function canDeliver(User $user, DomainRecord $record): bool
    {
        if (! $this->canRead($user, $record)) {
            return false;
        }
        $p = $record->payload ?? [];
        if (isset($p['_notification_actor'])) {
            $actor = User::find($p['_notification_actor']);
            if (! $actor) {
                return false;
            }
            try {
                $this->authorizeCreate($actor, $p);
            } catch (HttpException|ModelNotFoundException $e) {
                return false;
            }
        }

        return true;
    }

    public function canRead(User $user, DomainRecord $record): bool
    {
        if (! $user->isActive() || $record->domain !== DomainRecord::DOMAIN_NOTIFICATION || (int) $record->user_id !== (int) $user->id) {
            return false;
        }
        $p = $record->payload ?? [];
        if (! empty($p['linkTaskId'])) {
            $task = Task::find($p['linkTaskId']);

            return $task && app(UserPermissionGate::class)->any($user, 'tasks.view') && ((int) $task->assignee_id === (int) $user->id || (int) $task->project?->project_manager_id === (int) $user->id);
        }
        if (! empty($p['linkProjectId'])) {
            return app(UserPermissionGate::class)->any($user, 'projects.view') && Project::whereKey($p['linkProjectId'])->where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id)))->exists();
        }
        if (! empty($p['linkMeetingId'])) {
            $meeting = WorkspaceRecord::find($p['linkMeetingId']);
            if (! $meeting || ! $this->meetingMember($user, $meeting)) {
                return false;
            }
            if (($p['_bale_kind'] ?? '') === 'meeting_reminder') {
                $actor = User::find($p['_reminder_actor'] ?? null);
                if (! $actor?->isActive() || ! app(UserPermissionGate::class)->any($actor, 'meetings.edit') || (int) $actor->id !== (int) $meeting->owner_id) {
                    return false;
                }

                return in_array($meeting->status, ['scheduled', 'in_progress'], true) && hash_equals(MeetingReminders::snapshot($meeting), (string) ($p['_meeting_snapshot'] ?? ''));
            }
        }
        if (! empty($p['linkIdeaId'])) {
            $idea = WorkspaceRecord::find($p['linkIdeaId']);

            return $idea && $idea->kind === WorkspaceRecord::KIND_IDEA && app(UserPermissionGate::class)->any($user, 'thinktank.view');
        }
        if (! empty($p['linkLetterId'])) {
            $letter = WorkspaceRecord::find($p['linkLetterId']);

            return $letter && $letter->kind === WorkspaceRecord::KIND_LETTER && app(UserPermissionGate::class)->any($user, 'secretariat.view')
                && ((int) $letter->owner_id === (int) $user->id || in_array((string) $user->id, array_map('strval', array_filter(array_column((array) ($letter->payload['referrals'] ?? []), 'toUserId'), 'is_scalar')), true));
        }
        if (! empty($p['linkResolutionId'])) {
            $resolution = WorkspaceRecord::find($p['linkResolutionId']);

            return $resolution && $resolution->kind === WorkspaceRecord::KIND_RESOLUTION && app(UserPermissionGate::class)->any($user, 'secretariat.view')
                && (int) ($resolution->payload['responsibleUserId'] ?? $resolution->owner_id) === (int) $user->id;
        }
        if (! empty($p['linkContentId'])) {
            $content = Content::find($p['linkContentId']);

            return $content && app(ContentAccess::class)->canView($user, $content) && $this->contentMember($user, $content);
        }

        return true;
    }

    public function meetingMember(User $user, WorkspaceRecord $meeting): bool
    {
        return $user->isActive() && app(UserPermissionGate::class)->any($user, 'meetings.view') && $meeting->kind === WorkspaceRecord::KIND_MEETING
            && ((int) $meeting->owner_id === (int) $user->id || in_array((string) $user->id, array_map('strval', array_filter((array) ($meeting->payload['attendeeIds'] ?? []), 'is_scalar')), true));
    }

    private function contentMember(User $user, Content $content): bool
    {
        if (app(ContentAccess::class)->departmentMember($user, $content) || (int) $content->owner_id === (int) $user->id) {
            return true;
        }
        $p = $content->payload ?? [];
        $ids = [];
        foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $key) {
            $ids = [...$ids, ...(array) ($p[$key] ?? [])];
        }
        foreach (['creatorId', 'approverId', 'publisherId'] as $key) {
            $ids[] = $p[$key] ?? null;
        }
        foreach ((array) ($p['stages'] ?? []) as $stage) {
            if (is_array($stage)) {
                $ids[] = $stage['assigneeId'] ?? null;
            }
        }

        return in_array((string) $user->id, array_map('strval', array_filter($ids, 'is_scalar')), true);
    }

    /** Client-created notifications are not an arbitrary outbound messaging API. */
    public function authorizeCreate(User $actor, array $p): void
    {
        abort_unless($actor->isActive(), 403);
        $recipient = User::findOrFail($p['userId']);
        $links = array_filter(array_intersect_key($p, array_flip(['linkTaskId', 'linkProjectId', 'linkMeetingId', 'linkIdeaId', 'linkContentId', 'linkLetterId', 'linkResolutionId'])));
        if (! empty($p['linkTaskId'])) {
            $task = Task::findOrFail($p['linkTaskId']);
            abort_unless(app(UserPermissionGate::class)->any($actor, 'tasks.view') && ((int) $task->assignee_id === (int) $actor->id || (int) $task->project?->project_manager_id === (int) $actor->id || app(UserPermissionGate::class)->any($actor, ['tasks.assign', 'tasks.create', 'tasks.edit', 'tasks.status']) || ($p['type'] === 'comment' && $task->project?->members()->whereKey($actor->id)->exists())), 403);
            abort_unless((int) $task->assignee_id === (int) $recipient->id || (int) $task->project?->project_manager_id === (int) $recipient->id, 403);
            abort_if(isset($p['linkProjectId']) && (int) $p['linkProjectId'] !== (int) $task->project_id, 422);
            abort_if(! empty($p['linkMeetingId']) || ! empty($p['linkIdeaId']) || ! empty($p['linkContentId']) || ! empty($p['linkLetterId']) || ! empty($p['linkResolutionId']), 422);
        } elseif (! empty($p['linkProjectId'])) {
            $project = Project::findOrFail($p['linkProjectId']);
            abort_unless(app(UserPermissionGate::class)->any($actor, 'projects.view') && ((int) $project->project_manager_id === (int) $actor->id || $project->members()->whereKey($actor->id)->exists()), 403);
            abort_if(count($links) !== 1, 422);
        } elseif (! empty($p['linkMeetingId'])) {
            $meeting = WorkspaceRecord::findOrFail($p['linkMeetingId']);
            abort_unless((int) $meeting->owner_id === (int) $actor->id && app(UserPermissionGate::class)->any($actor, 'meetings.edit'), 403);
            abort_if(count($links) !== 1, 422);
        } elseif (! empty($p['linkLetterId'])) {
            $letter = WorkspaceRecord::findOrFail($p['linkLetterId']);
            abort_unless(count($links) === 1 && $letter->kind === WorkspaceRecord::KIND_LETTER && app(UserPermissionGate::class)->any($actor, 'secretariat.view') && app(UserPermissionGate::class)->any($actor, ['secretariat.refer_letter', 'secretariat.edit_letter']), 403);
        } elseif (! empty($p['linkResolutionId'])) {
            $resolution = WorkspaceRecord::findOrFail($p['linkResolutionId']);
            abort_unless(count($links) === 1 && $resolution->kind === WorkspaceRecord::KIND_RESOLUTION && app(UserPermissionGate::class)->any($actor, 'secretariat.view') && app(UserPermissionGate::class)->any($actor, 'secretariat.manage_resolutions'), 403);
        } elseif (! empty($p['linkContentId'])) {
            $content = Content::findOrFail($p['linkContentId']);
            abort_unless(count($links) === 1 && app(ContentAccess::class)->canView($actor, $content) && ($this->contentMember($actor, $content) || app(UserPermissionGate::class)->any($actor, ['content.edit', 'content.review']) || ($p['type'] === 'comment' && (int) $recipient->id === (int) $content->owner_id)), 403);
        } elseif (! empty($p['linkIdeaId'])) {
            $idea = WorkspaceRecord::findOrFail($p['linkIdeaId']);
            $participants = array_filter(array_column((array) ($idea->payload['comments'] ?? []), 'userId'), 'is_scalar');
            abort_unless(count($links) === 1 && $idea->kind === WorkspaceRecord::KIND_IDEA && app(UserPermissionGate::class)->any($actor, 'thinktank.view') && (app(UserPermissionGate::class)->any($actor, ['thinktank.vote', 'thinktank.edit_idea', 'thinktank.approve_convert']) || (int) $idea->owner_id === (int) $actor->id), 403);
            abort_unless((int) $idea->owner_id === (int) $recipient->id || in_array((string) $recipient->id, array_map('strval', $participants), true), 403);
        } else {
            // Free-form cross-user messages need a verifiable domain subject; this is not a broadcast API.
            abort_unless((int) $recipient->id === (int) $actor->id && $links === [], 403);
        }
        $candidate = new DomainRecord(['domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $recipient->id, 'payload' => $p]);
        abort_unless($this->canRead($recipient, $candidate), 403);
    }
}
