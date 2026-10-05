<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\User;
use App\Support\Content\ContentCodeAllocator;
use App\Support\Content\ContentStatusPolicy;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * The single persistence path for ordinary and Series-created Contents.
 * Every occurrence is a real Content and therefore keeps the existing code,
 * workflow, DAM, history, deadline and task engines.
 */
final class ContentCreator
{
    /**
     * @param array<string,mixed> $input full client/domain payload
     * @param array<string,mixed> $canonical validated canonical fields
     * @param array{series_id?:int,series_sequence?:int,period_key?:string,materialize_tasks?:bool,activate_at?:string|null} $options
     */
    public function create(User $actor, array $input, array $canonical = [], array $options = []): Content
    {
        return DB::transaction(function () use ($actor, $input, $canonical, $options): Content {
            if (isset($input['stages']) && is_array($input['stages'])) {
                $input['stages'] = app(ContentAssetRelations::class)->normalize($actor, null, $input['stages']);
            }
            app(ContentPublication::class)->guardGenericWrite($input, null);
            app(ContentReview::class)->guardGeneric($input, null, $actor);
            if (ContentStatusPolicy::isDerived($canonical['status'] ?? null)) {
                unset($canonical['status']);
            }

            $projectId = $canonical['projectId'] ?? ($input['projectId'] ?? null);
            app(ActiveProjectGuard::class)->project($projectId);
            $payload = app(ContentWriteHistory::class)->apply($actor, $input, null);
            if (array_key_exists('activate_at', $options) && $options['activate_at']) {
                $payload['_seriesPlanning'] = [
                    'activateAt' => $options['activate_at'],
                    'activatedAt' => null,
                ];
            }
            $content = Content::create([
                'title' => $canonical['title'] ?? $payload['title'],
                'type' => $canonical['type'] ?? $payload['type'],
                'status' => $canonical['status'] ?? ($payload['status'] ?? 'idea'),
                'deadline' => $canonical['deadline'] ?? ($payload['deadline'] ?? null),
                'owner_id' => $canonical['ownerId'] ?? ($payload['ownerId'] ?? null),
                'project_id' => $canonical['projectId'] ?? ($payload['projectId'] ?? null),
                'series_id' => $options['series_id'] ?? null,
                'series_sequence' => $options['series_sequence'] ?? null,
                'period_key' => $options['period_key'] ?? null,
                'payload' => Arr::except($payload, [
                    'id', 'comments', 'createdAt', 'updatedAt', 'publicationVersion', 'reviewVersion',
                    'reviewableStageIds', 'access', 'isWatched',
                ]),
            ]);
            app(ContentCodeAllocator::class)->assign($content, $input['code'] ?? null, $payload);
            app(ContentAssetRelations::class)->sync($actor, $content->refresh());
            if ($options['materialize_tasks'] ?? true) {
                app(ContentStageTaskSync::class)->sync($content);
            }

            ActivityLog::create([
                'user_id' => $actor->id,
                'project_id' => $content->project_id,
                'type' => $content->series_id ? 'series_occurrence_created' : 'content_created',
                'action' => $content->series_id ? 'ایجاد رخداد مستقل مجموعه محتوا' : 'ایجاد پرونده محتوا',
                'details' => 'content:'.$content->id,
                'metadata' => [
                    'recordType' => 'content', 'recordId' => (string) $content->id,
                    'changes' => [['field' => 'status', 'from' => null, 'to' => $content->status]],
                ],
            ]);

            return $content->refresh();
        }, 3);
    }
}
