<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Department;
use App\Models\Project;
use App\Models\User;

/** A watch grant is necessary but never turns global content.view into global follow. */
final class ContentWatchAccess
{
    public function canFollow(?User $user, Content $content): bool
    {
        if (! $user?->isActive() || ! $user->hasPermission('content.watch')
            || ! app(ContentAccess::class)->canView($user, $content)) {
            return false;
        }
        if ($user->isAdmin() || app(ContentAccess::class)->participant($user, $content)) {
            return true;
        }
        if ($content->project_id && Project::whereKey($content->project_id)->where('project_manager_id', $user->id)->exists()) {
            return true;
        }
        $departmentIds = array_values(array_filter([
            $content->payload['departmentId'] ?? null,
            ...($content->payload['departmentIds'] ?? []),
        ], fn ($id) => is_numeric($id)));

        return $departmentIds !== [] && Department::whereIn('id', $departmentIds)->where('manager_id', $user->id)->exists();
    }
}
