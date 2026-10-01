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
                $q->orWhereJsonContains('payload->stages', ['assigneeId' => (string) $user->id])->orWhereJsonContains('payload->stages', ['assigneeId' => $user->id]);
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

    public function unread(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->where('payload->read', false)->orWhereNull('payload->read'));
    }
}
