<?php

namespace App\Services;

use App\Models\Project;

/** Prevent new domain records from being attached to an archived project. */
final class ActiveProjectGuard
{
    public function project(int|string|null $projectId): ?Project
    {
        if ($projectId === null || $projectId === '') {
            return null;
        }

        $project = Project::query()->findOrFail((int) $projectId);
        abort_if($project->status === 'archived', 409, 'پروژه بایگانی شده است و رکورد جدیدی نمی‌توان به آن افزود.');

        return $project;
    }
}
