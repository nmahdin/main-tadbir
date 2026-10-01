<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Database\Eloquent\Builder;

/** SQL visibility before counting/paging. Same recipient/subject membership as NotificationAccess. */
final class NotificationInbox
{
    public const CATEGORIES = ['tasks', 'content', 'meetings', 'secretariat', 'collaboration', 'system'];

    public function query(User $user): Builder
    {
        $query = DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->where('user_id', $user->id);
        if (! $user->isActive()) {
            return $query->whereRaw('1=0');
        }
        $subjects = [
            'linkTaskId' => ['tasks.view', Task::where(fn ($q) => $q->where('assignee_id', $user->id)->orWhereIn('project_id', Project::where('project_manager_id', $user->id)->select('id')))->select('id')],
            'linkProjectId' => ['projects.view', Project::where(fn ($q) => $q->where('project_manager_id', $user->id)->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id)))->select('id')],
            'linkMeetingId' => ['meetings.view', WorkspaceRecord::where('kind', WorkspaceRecord::KIND_MEETING)->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereJsonContains('payload->attendeeIds', (string) $user->id)->orWhereJsonContains('payload->attendeeIds', $user->id))->select('id')],
            'linkIdeaId' => ['thinktank.view', WorkspaceRecord::where('kind', WorkspaceRecord::KIND_IDEA)->select('id')],
            'linkContentId' => ['content.view', Content::where(function ($q) use ($user) {
                $q->where('owner_id', $user->id)->orWhere(fn ($department) => app(ContentAccess::class)->scopeDepartments($department, $user));
                foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $key) {
                    $q->orWhereJsonContains('payload->'.$key, (string) $user->id)->orWhereJsonContains('payload->'.$key, $user->id);
                }
                foreach (['creatorId', 'approverId', 'publisherId'] as $key) {
                    $q->orWhere('payload->'.$key, (string) $user->id);
                }
                foreach (['assigneeId', 'reviewerId', 'approverId'] as $stageField) {
                    $q->orWhereJsonContains('payload->stages', [$stageField => (string) $user->id])
                        ->orWhereJsonContains('payload->stages', [$stageField => $user->id]);
                }
            })->select('id')],
            'linkLetterId' => ['secretariat.view', WorkspaceRecord::where('kind', WorkspaceRecord::KIND_LETTER)->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereJsonContains('payload->referrals', ['toUserId' => (string) $user->id])->orWhereJsonContains('payload->referrals', ['toUserId' => $user->id]))->select('id')],
            'linkResolutionId' => ['secretariat.view', WorkspaceRecord::where('kind', WorkspaceRecord::KIND_RESOLUTION)->where(fn ($q) => $q->where('payload->responsibleUserId', (string) $user->id)->orWhere(fn ($q) => $q->whereNull('payload->responsibleUserId')->where('owner_id', $user->id)))->select('id')],
        ];
        // Match NotificationAccess primary-subject priority. Secondary context links are validated on creation.
        $preceding = [];
        foreach ($subjects as $field => [$permission, $ids]) {
            $query->where(function ($q) use ($field, $permission, $ids, $user, $preceding) {
                $q->whereNull('payload->'.$field)->orWhere('payload->'.$field, '');
                foreach ($preceding as $prior) {
                    $q->orWhere(fn ($p) => $p->whereNotNull('payload->'.$prior)->where('payload->'.$prior, '!=', ''));
                }
                if ($permission === 'content.view' ? app(ContentAccess::class)->canEnter($user) : $user->hasPermission($permission)) {
                    $q->orWhereIn('payload->'.$field, $ids);
                }
            });
            $preceding[] = $field;
        }

        return $query;
    }

    /** Apply the same stable categories used by Bale without paginating mixed categories first. */
    public function category(Builder $query, string $category): Builder
    {
        return $query->where(function (Builder $outer) use ($category): void {
            $outer->where('payload->notificationCategory', $category)
                ->orWhere(function (Builder $inferred) use ($category): void {
                    $inferred->where(function (Builder $missing): void {
                        $missing->whereNull('payload->notificationCategory')
                            ->orWhere('payload->notificationCategory', '')
                            ->orWhereNotIn('payload->notificationCategory', self::CATEGORIES);
                    });
                    match ($category) {
                        'tasks' => $this->hasLink($inferred, 'linkTaskId'),
                        'content' => $inferred->where(fn (Builder $q) => $this->noLink($q, 'linkTaskId'))
                            ->where(fn (Builder $q) => $this->hasLink($q, 'linkContentId')),
                        'meetings' => $inferred
                            ->where(fn (Builder $q) => $this->noLinks($q, ['linkTaskId', 'linkContentId']))
                            ->where(fn (Builder $q) => $this->hasAnyLink($q, ['linkMeetingId', 'linkIdeaId'])),
                        'secretariat' => $inferred
                            ->where(fn (Builder $q) => $this->noLinks($q, ['linkTaskId', 'linkContentId', 'linkMeetingId', 'linkIdeaId']))
                            ->where(fn (Builder $q) => $this->hasAnyLink($q, ['linkLetterId', 'linkResolutionId'])),
                        'collaboration' => $inferred
                            ->where(fn (Builder $q) => $this->noLinks($q, ['linkTaskId', 'linkContentId', 'linkMeetingId', 'linkIdeaId', 'linkLetterId', 'linkResolutionId']))
                            ->whereIn('payload->type', ['comment', 'mention', 'reply']),
                        default => $inferred
                            ->where(fn (Builder $q) => $this->noLinks($q, ['linkTaskId', 'linkContentId', 'linkMeetingId', 'linkIdeaId', 'linkLetterId', 'linkResolutionId']))
                            ->whereNotIn('payload->type', ['comment', 'mention', 'reply']),
                    };
                });
        });
    }

    private function hasLink(Builder $query, string $field): Builder
    {
        return $query->whereNotNull('payload->'.$field)->where('payload->'.$field, '!=', '');
    }

    private function noLink(Builder $query, string $field): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull('payload->'.$field)->orWhere('payload->'.$field, ''));
    }

    /** @param list<string> $fields */
    private function noLinks(Builder $query, array $fields): Builder
    {
        foreach ($fields as $field) {
            $this->noLink($query, $field);
        }

        return $query;
    }

    /** @param list<string> $fields */
    private function hasAnyLink(Builder $query, array $fields): Builder
    {
        return $query->where(function (Builder $links) use ($fields): void {
            foreach ($fields as $field) {
                $links->orWhere(fn (Builder $q) => $this->hasLink($q, $field));
            }
        });
    }

    public function unread(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->where('payload->read', false)->orWhereNull('payload->read'));
    }
}
