<?php

namespace App\Services;

use App\Events\ContentPublished;
use App\Models\Content;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** First rule: publication in Tadbir. Other source rules are not wired yet. */
final class TaskAutomationProcessor
{
    public function handle(ContentPublished $event): void
    {
        DB::transaction(function () use ($event): void {
            $content = Content::whereKey($event->contentId)->lockForUpdate()->first();
            if (! $content || ! ContentPublication::published($content)) {
                return;
            }
            $receipt = $content->payload['_publication'] ?? [];
            if (($receipt['event_id'] ?? null) !== $event->eventId || ($receipt['processed'] ?? false)) {
                return;
            }
            abort_unless((int) ($receipt['actor_id'] ?? 0) === $event->actorId, 409);
            $actor = User::findOrFail($event->actorId);
            app(ContentPublication::class)->authorize($actor);
            $tasks = app(ContentPublication::class)->targets($content)->whereIn('id', $receipt['task_ids'] ?? [])->orderBy('id')->lockForUpdate()->get();
            foreach ($tasks as $task) {
                if (in_array($task->status, ['completed', 'archived'], true)) {
                    continue;
                }
                app(TaskOperations::class)->completeAfterPublication($actor, $task, $event);
            }
            $payload = $content->payload;
            $payload['_publication']['processed'] = true;
            $payload['_publication']['processed_at'] = now()->toIso8601String();
            $content->update(['payload' => $payload]);
        });
    }
}
