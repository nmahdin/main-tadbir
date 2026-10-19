<?php

namespace App\Modules\Notifications\Services;

use App\Http\Resources\DomainRecordResource;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Modules\Contents\Services\ContentAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** SQL visibility before counting/paging. Same recipient/subject membership as NotificationAccess. */
final class NotificationInbox
{
    public const CATEGORIES = ['tasks', 'content', 'meetings', 'secretariat', 'collaboration', 'system'];

    /**
     * Paginated inbox listing for the HTTP layer (used by the
     * notification controller and the generic domain-record endpoint,
     * which delegates the notification domain here).
     */
    public function listing(Request $request): AnonymousResourceCollection
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,200'],
            'read' => ['sometimes', Rule::in(['unread', 'read'])], 'type' => ['sometimes', 'string', 'max:80'],
            'category' => ['sometimes', Rule::in(self::CATEGORIES)]]);
        $query = $this->query($request->user());
        $unread = $this->unread(clone $query)->count();
        $types = (clone $query)->select('payload->type as type')->distinct()->get()->pluck('type')->filter()->values();
        if ($request->input('read') === 'unread') {
            $this->unread($query);
        }
        if ($request->input('read') === 'read') {
            $query->where('payload->read', true);
        }
        if ($request->filled('type')) {
            $query->where('payload->type', $request->input('type'));
        }
        if ($request->filled('category')) {
            $this->category($query, $request->string('category')->toString());
        }

        return DomainRecordResource::collection($query->orderByDesc('id')->paginate($request->integer('per_page', 20))->withQueryString())
            ->additional(['meta' => ['unread_count' => $unread, 'types' => $types, 'categories' => self::CATEGORIES]]);
    }

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
