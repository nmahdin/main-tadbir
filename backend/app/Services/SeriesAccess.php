<?php

namespace App\Services;

use App\Models\ContentSeries;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class SeriesAccess
{
    public function visibleTo(User $user): Builder
    {
        $query = ContentSeries::query();
        if (! $user->isActive() || ! app(ContentAccess::class)->canEnter($user)) {
            return $query->whereRaw('1 = 0');
        }
        if ($user->role?->key === 'admin') {
            return $user->hasPermission('projects.view') ? $query : $query->whereNull('project_id');
        }
        $departmentIds = array_map('intval', app(ContentAccess::class)->departmentIds($user));

        return $query->where(function (Builder $scope) use ($user, $departmentIds): void {
            $scope->where(function (Builder $standalone) use ($user, $departmentIds): void {
                $standalone->whereNull('project_id')->where(function (Builder $allowed) use ($user, $departmentIds): void {
                    $allowed->where('owner_id', $user->id)->orWhereNull('department_id');
                    if ($departmentIds !== []) {
                        $allowed->orWhereIn('department_id', $departmentIds);
                    }
                });
            });
            if ($user->hasPermission('projects.view')) {
                $scope->orWhereHas('project', fn (Builder $project) => $project
                    ->where('project_manager_id', $user->id)
                    ->orWhereHas('members', fn (Builder $members) => $members->where('users.id', $user->id)));
            }
        });
    }

    public function canView(?User $user, ContentSeries $series): bool
    {
        if (! $user?->isActive() || ! app(ContentAccess::class)->canEnter($user)) {
            return false;
        }
        if ($series->project_id) {
            $project = $series->relationLoaded('project') ? $series->project : Project::find($series->project_id);

            return $project && app(ProjectScopeAccess::class)->canView($user, $project);
        }
        if ($user->role?->key === 'admin' || (int) $series->owner_id === (int) $user->id) {
            return true;
        }
        if (! $series->department_id) {
            return true;
        }

        return in_array((string) $series->department_id, app(ContentAccess::class)->departmentIds($user), true);
    }

    public function canCreate(?User $user, ?Project $project = null): bool
    {
        return $user?->isActive() && $user->hasPermission('content.create')
            && (! $project || app(ProjectScopeAccess::class)->canEdit($user, $project));
    }

    public function canEdit(?User $user, ContentSeries $series): bool
    {
        return $user?->hasPermission('content.edit') && $this->canView($user, $series)
            && (! $series->project || app(ProjectScopeAccess::class)->canEdit($user, $series->project));
    }

    public function canArchive(?User $user, ContentSeries $series): bool
    {
        if (! $user?->isActive() || ! $user->hasPermission('content.delete') || ! $this->canView($user, $series)) {
            return false;
        }
        if (! $series->project_id) {
            return true;
        }
        $project = $series->relationLoaded('project') ? $series->project : Project::find($series->project_id);

        return $project && ($user->role?->key === 'admin' || (int) $project->project_manager_id === (int) $user->id);
    }
}
