<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;

/** Shared membership boundary for project-scoped operational endpoints. */
final class ProjectScopeAccess
{
    public function canView(?User $user, Project $project): bool
    {
        if (! $user?->isActive() || ! $user->hasPermission('projects.view')) {
            return false;
        }
        if ($user->role?->key === 'admin' || (int) $project->project_manager_id === (int) $user->id) {
            return true;
        }

        return $project->members()->whereKey($user->id)->exists();
    }

    public function canEdit(?User $user, Project $project): bool
    {
        if (! $user?->isActive() || ! $user->hasPermission('projects.edit')) {
            return false;
        }

        return $user->role?->key === 'admin' || (int) $project->project_manager_id === (int) $user->id;
    }

    public function canArchive(?User $user, Project $project): bool
    {
        return $user?->isActive() && $user->hasPermission('projects.delete')
            && ($user->role?->key === 'admin' || (int) $project->project_manager_id === (int) $user->id);
    }

    public function assertView(?User $user, Project $project): void { abort_unless($this->canView($user, $project), 403); }
    public function assertEdit(?User $user, Project $project): void { abort_unless($this->canEdit($user, $project), 403); }
    public function assertArchive(?User $user, Project $project): void { abort_unless($this->canArchive($user, $project), 403); }
}
