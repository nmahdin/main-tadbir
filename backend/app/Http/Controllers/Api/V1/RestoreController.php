<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContentResource;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\TaskResource;
use App\Models\Content;
use App\Models\Project;
use App\Models\Task;
use App\Services\ContentAccess;
use App\Services\TaskOperations;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RestoreController extends Controller
{
    public function __invoke(Request $request, string $module, string $id)
    {
        $actor = $request->user()->fresh();
        $model = match ($module) {
            'projects' => Project::class, 'tasks' => Task::class, 'contents' => Content::class
        };
        $permission = $module === 'contents' ? 'content' : $module;
        abort_unless($actor?->isActive() && ($model === Content::class ? app(ContentAccess::class)->canEnter($actor) : $actor->hasPermission($permission.'.view')), 403);

        return DB::transaction(function () use ($actor, $model, $id, $permission) {
            $record = $model::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($record instanceof Task) {
                abort_unless(app(TaskOperations::class)->allowedStatuses($actor, $record) !== [], 403);
            } elseif ($record instanceof Content) {
                app(ContentAccess::class)->guardEdit($actor, $record, []);
            } else {
                abort_unless($actor->hasPermission($permission.'.edit'), 403);
            }
            if ($record->status === 'archived') {
                // Older archived records have no recoverable previous status.
                $status = $record->previous_status ?: match ($model) {
                    Task::class => 'todo', Project::class => 'active', default => 'idea'
                };
                if ($record instanceof Content) {
                    $status = match ($status) {
                        'in_progress' => 'producing',
                        'completed' => 'approved',
                        default => $status,
                    };
                }
                if ($record instanceof Content && $status === 'published') {
                    abort_unless($actor->hasPermission('content.publish'), 403);
                }
                if ($record instanceof Task) {
                    $record = app(TaskOperations::class)->changeStatus($actor, $record, $status, 'archived');
                } else {
                    $record->update(['status' => $status]);
                }
            }

            return match ($model) {
                Task::class => new TaskResource($record->load(['comments', 'attachments', 'activityLogs'])),
                Project::class => new ProjectResource($record->load('members:id')),
                default => new ContentResource($record),
            };
        });
    }
}
