<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectTemplate;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Runs within project creation's transaction; no client-side child-task fan-out. */
final class ProjectTemplateApplication
{
    public function apply(User $actor, Project $project): void
    {
        if (! $project->template_id) {
            return;
        }
        $template = ProjectTemplate::whereKey($project->template_id)->lockForUpdate()->firstOrFail();
        $data = Validator::make(['tasks' => $template->tasks ?? []], [
            'tasks' => ['array', 'list', 'max:200'],
            'tasks.*.title' => ['required', 'string', 'max:255'],
            'tasks.*.description' => ['nullable', 'string', 'max:10000'],
            'tasks.*.relativeDueDays' => ['sometimes', 'integer', 'between:0,3650'],
            'tasks.*.estimatedHours' => ['sometimes', 'integer', 'between:0,100000'],
            'tasks.*.priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'tasks.*.status' => ['sometimes', Rule::in(TaskOperations::STATUSES)],
            'tasks.*.tags' => ['sometimes', 'array', 'max:50'],
            'tasks.*.tags.*' => ['string', 'max:80'],
            'tasks.*.subtasks' => ['sometimes', 'array', 'list', 'max:200'],
            'tasks.*.subtasks.*' => ['string', 'min:1', 'max:255'],
        ])->validate();
        if ($data['tasks'] === []) {
            return;
        }
        abort_unless($actor->hasPermission('tasks.create'), 403);
        $assignee = $project->project_manager_id;
        if (! $assignee) {
            throw ValidationException::withMessages(['projectManagerId' => 'برای ساخت تسک‌های الگو، مدیر پروژه را مشخص کنید.']);
        }
        abort_if((int) $assignee !== (int) $actor->id && ! $actor->hasPermission('tasks.assign'), 403);
        $start = $project->start_date ?? today();
        foreach ($data['tasks'] as $row) {
            $task = Task::create([
                'project_id' => $project->id, 'title' => $row['title'], 'description' => $row['description'] ?? '',
                'assignee_id' => $assignee, 'kind' => 'general', 'status' => $row['status'] ?? 'backlog',
                'priority' => $row['priority'] ?? $project->priority ?? 'medium',
                'start_date' => $start, 'deadline' => $start->copy()->addDays($row['relativeDueDays'] ?? 0),
                'estimated_hours' => $row['estimatedHours'] ?? 0, 'tags' => $row['tags'] ?? [],
                'subtasks' => array_map(fn ($title) => ['id' => (string) Str::uuid(), 'title' => $title, 'completed' => false], $row['subtasks'] ?? []),
            ]);
            app(TaskAssignmentNotifications::class)->created($task);
        }
        app(TaskOperations::class)->updateProjectProgress($project->id);
    }
}
