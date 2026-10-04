<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** One server-side visibility policy shared by lists, detail, duplicates and table cells. */
final class DamAssetAccess
{
    public function visibleTo(User $user): Builder
    {
        $query = DamAsset::query();
        if ($user->isAdmin()) {
            return $query;
        }

        $userId = (int) $user->getKey();
        $roleKey = $user->role?->is_active ? $user->role->key : null;
        $projectIds = Project::query()
            ->where('project_manager_id', $userId)
            ->orWhereHas('members', fn (Builder $members) => $members->where('users.id', $userId))
            ->pluck('projects.id')->map(fn ($id) => (int) $id)->all();
        $contentIds = $this->visibleContentIds($user);

        return $query->where(function (Builder $assets) use ($userId, $roleKey, $projectIds, $contentIds): void {
            $assets->where('confidentiality', '!=', 'confidential')
                ->orWhere('owner_id', $userId)
                ->orWhereHas('relations', fn (Builder $relations) => $relations
                    ->where('related_type', 'content')->whereIn('related_id', $contentIds))
                ->orWhere(function (Builder $granted) use ($userId, $roleKey, $projectIds): void {
                    $granted->where('confidentiality', 'confidential')
                        ->where(function (Builder $any) use ($userId, $roleKey, $projectIds): void {
                            $any->whereJsonContains('access_grants->users', $userId)
                                ->when($roleKey !== null, fn (Builder $q) => $q->orWhereJsonContains('access_grants->roles', (string) $roleKey))
                                ->when($projectIds !== [], function (Builder $q) use ($projectIds): void {
                                    foreach ($projectIds as $projectId) {
                                        $q->orWhereJsonContains('access_grants->projects', $projectId);
                                    }
                                });
                        });
                });
        });
    }

    public function canView(User $user, DamAsset $asset): bool
    {
        $entry = $user->hasPermission('assets.view') || $this->canAccessLinkedContent($user, $asset);

        return $user->isActive() && $entry && $this->visibleTo($user)->whereKey($asset->getKey())->exists();
    }

    public function canAccessLinkedContent(User $user, DamAsset $asset): bool
    {
        return $asset->relations()->where('related_type', 'content')
            ->whereIn('related_id', $this->visibleContentIds($user))->exists();
    }

    /** Query-only scope: never load every Content row to decide a DAM page. */
    private function visibleContentIds(User $user): Builder
    {
        $query = Content::query()->select('contents.id');
        if ($user->hasPermission('content.view')) {
            return $query;
        }

        $userId = (int) $user->getKey();
        $userString = (string) $userId;

        return $query->where(function (Builder $contents) use ($user, $userId, $userString): void {
            $contents->where('owner_id', $userId)
                ->orWhereIn('id', Task::query()->where('assignee_id', $userId)->whereNotNull('content_id')->select('content_id'));
            foreach (['publisherId', 'approverId', 'creatorId'] as $field) {
                $contents->orWhere('payload->'.$field, $userString)->orWhere('payload->'.$field, $userId);
            }
            foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $field) {
                $contents->orWhereJsonContains('payload->'.$field, $userString)
                    ->orWhereJsonContains('payload->'.$field, $userId);
            }
            $contents->orWhere(fn (Builder $departments) => app(ContentAccess::class)->scopeDepartments($departments, $user));
        });
    }
}
