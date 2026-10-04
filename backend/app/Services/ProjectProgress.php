<?php

namespace App\Services;

use App\Models\Project;

/** Progress is derived from real operational records; stored progress is only a cache. */
final class ProjectProgress
{
    public function calculate(Project $project): int
    {
        $tasks = $project->tasks()->where('status', '!=', 'archived');
        $taskTotal = (clone $tasks)->count();
        if ($taskTotal > 0) {
            return (int) round((clone $tasks)->where('status', 'completed')->count() / $taskTotal * 100);
        }
        $contents = $project->contents()->where('status', '!=', 'archived');
        $contentTotal = (clone $contents)->count();
        if ($contentTotal > 0) {
            return (int) round((clone $contents)->whereIn('status', ['published', 'approved', 'ready_to_publish'])->count() / $contentTotal * 100);
        }
        return 0;
    }
}
