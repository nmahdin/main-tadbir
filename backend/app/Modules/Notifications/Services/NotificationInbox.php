<?php

namespace App\Modules\Notifications\Services;

use App\Core\Settings\SettingValueStore;
use App\Http\Resources\DomainRecordResource;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Modules\Contents\Services\ContentAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Throwable;

/** SQL visibility before counting/paging. Same recipient/subject membership as NotificationAccess. */
final class NotificationInbox
{
    public const CATEGORIES = ['tasks', 'content', 'meetings', 'secretariat', 'collaboration', 'system'];

    /** Categories a user may mute; system/security are never mutable. */
    public const MUTABLE_CATEGORIES = ['tasks', 'content', 'meetings', 'secretariat', 'collaboration'];

    public const MUTES_KEY = 'user.experience.notification_mutes';

    /**
     * UX-02-4: derive the denormalized category for a payload — the
     * explicit category wins; otherwise mirror the listing inference.
     */
    public static function categoryOfPayload(array $payload): string
    {
        $explicit = $payload['notificationCategory'] ?? null;
        if (is_string($explicit) && in_array($explicit, self::CATEGORIES, true)) {
            return $explicit;
        }
        $has = fn (string $field): bool => ! empty($payload[$field]);
        if ($has('linkTaskId')) {
            return 'tasks';
        }
        if ($has('linkContentId')) {
            return 'content';
        }
        if ($has('linkMeetingId') || $has('linkIdeaId')) {
            return 'meetings';
        }
        if ($has('linkLetterId') || $has('linkResolutionId')) {
            return 'secretariat';
        }
        if (in_array($payload['type'] ?? null, ['comment', 'mention', 'reply'], true)) {
            return 'collaboration';
        }

        return 'system';
    }

    /** Stable grouping key: explicit producer value, else category:type:subject. */
    public static function groupKeyOf(array $payload, ?string $category = null): string
    {
        $explicit = $payload['group_key'] ?? null;
        if (is_string($explicit) && $explicit !== '') {
            return $explicit;
        }
        $category ??= self::categoryOfPayload($payload);
        $type = is_string($payload['type'] ?? null) && $payload['type'] !== '' ? $payload['type'] : 'general';
        $subject = $payload['linkTaskId'] ?? $payload['linkContentId'] ?? $payload['linkProjectId']
            ?? $payload['linkMeetingId'] ?? $payload['linkIdeaId'] ?? $payload['linkLetterId'] ?? $payload['linkResolutionId'] ?? null;

        return $category.':'.$type.':'.($subject !== null && $subject !== '' ? (string) $subject : 'none');
    }

    /** Mandatory/security rows are exempt from muting, bulk-read and pruning. */
    public static function isExempt(array $payload, ?string $category = null): bool
    {
        if (($payload['mandatory'] ?? false) === true) {
            return true;
        }
        $type = (string) ($payload['type'] ?? '');

        return str_starts_with($type, 'security') || (($payload['security'] ?? false) === true);
    }

    /** Effective user mute set: stored list intersected with mutable categories. */
    public function mutedCategories(User $user): array
    {
        try {
            $stored = app(SettingValueStore::class)->get('user', (int) $user->id, self::MUTES_KEY);
        } catch (Throwable) {
            return [];
        }
        $raw = $stored->exists ? $stored->value : null;
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_intersect(self::MUTABLE_CATEGORIES, array_map('strval', $raw)));
    }

    private function withoutCategories(Builder $query, array $categories): Builder
    {
        foreach ($categories as $category) {
            $query->whereNot(fn (Builder $q) => $this->category($q, $category));
        }

        return $query;
    }

    /**
     * Paginated inbox listing for the HTTP layer (used by the
     * notification controller and the generic domain-record endpoint,
     * which delegates the notification domain here).
     */
    public function listing(Request $request): AnonymousResourceCollection|JsonResponse
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,100000'], 'per_page' => ['sometimes', 'integer', 'between:1,200'],
            'read' => ['sometimes', Rule::in(['unread', 'read'])], 'type' => ['sometimes', 'string', 'max:80'],
            'category' => ['sometimes', Rule::in(self::CATEGORIES)],
            'group_key' => ['sometimes', 'string', 'max:120'],
            'grouped' => ['sometimes', 'boolean']]);
        $user = $request->user();
        $query = $this->query($user);
        $muted = $this->mutedCategories($user);
        $unreadAll = $this->unread(clone $query)->count();
        // The badge count excludes muted categories; the raw total stays available.
        $unreadQuery = $this->unread(clone $query);
        $this->withoutCategories($unreadQuery, $muted);
        $unread = $unreadQuery->count();
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
        if ($request->filled('group_key')) {
            $query->where('group_key', $request->string('group_key')->toString());
        }
        $meta = ['unread_count' => $unread, 'unread_count_all' => $unreadAll, 'muted_categories' => $muted, 'types' => $types, 'categories' => self::CATEGORIES];

        if ($request->boolean('grouped')) {
            return $this->groupedListing($query, $request, $meta);
        }

        return DomainRecordResource::collection($query->orderByDesc('id')->paginate($request->integer('per_page', 20))->withQueryString())
            ->additional(['meta' => $meta]);
    }

    /**
     * Grouped view: groups (by stable group_key) over the newest
     * visible rows, latest activity first. Display aggregation only —
     * every row keeps its own read state.
     */
    private function groupedListing(Builder $query, Request $request, array $meta): JsonResponse
    {
        $perPage = $request->integer('per_page', 20);
        $page = max(1, $request->integer('page', 1));
        $rows = $query->orderByDesc('id')->limit(500)->get();
        $groups = [];
        foreach ($rows as $row) {
            $payload = is_array($row->payload) ? $row->payload : [];
            $category = $row->category_key ?: self::categoryOfPayload($payload);
            $key = $row->group_key ?: self::groupKeyOf($payload, $category);
            $isUnread = empty($payload['read']);
            if (! isset($groups[$key])) {
                $groups[$key] = [
                    'group_key' => $key,
                    'category' => $category,
                    'type' => $payload['type'] ?? 'general',
                    'title' => $row->title ?? ($payload['title'] ?? ''),
                    'message' => $payload['message'] ?? '',
                    'count' => 0,
                    'unread_count' => 0,
                    'latest_id' => (string) $row->id,
                    'latest_at' => $row->created_at?->toIso8601String(),
                    'linkTaskId' => $payload['linkTaskId'] ?? null,
                    'linkProjectId' => $payload['linkProjectId'] ?? null,
                    'linkContentId' => $payload['linkContentId'] ?? null,
                    'linkMeetingId' => $payload['linkMeetingId'] ?? null,
                    'linkIdeaId' => $payload['linkIdeaId'] ?? null,
                ];
            }
            $groups[$key]['count']++;
            if ($isUnread) {
                $groups[$key]['unread_count']++;
            }
        }
        $all = array_values($groups);
        $total = count($all);
        $slice = array_slice($all, ($page - 1) * $perPage, $perPage);

        return response()->json([
            'data' => $slice,
            'meta' => [...$meta, 'total' => $total, 'current_page' => $page, 'per_page' => $perPage, 'last_page' => max(1, (int) ceil($total / max(1, $perPage)))],
        ]);
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
