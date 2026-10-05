<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContentRequest;
use App\Http\Requests\PublicationCommandRequest;
use App\Http\Requests\PublicationSettingsRequest;
use App\Http\Requests\PublicationTaskRequest;
use App\Http\Requests\WorkspaceListRequest;
use App\Http\Resources\ContentResource;
use App\Http\Resources\TaskResource;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\User;
use App\Services\ActiveProjectGuard;
use App\Services\ContentAccess;
use App\Services\ContentArchive;
use App\Services\ContentAssetRelations;
use App\Services\ContentCreator;
use App\Services\ContentPublication;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use App\Services\ContentWatchNotifier;
use App\Services\ContentWriteHistory;
use App\Services\PlannedOccurrenceActivator;
use App\Support\Content\ContentCodeAllocator;
use App\Support\Content\ContentCodePolicy;
use App\Support\Content\ContentStatusPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ContentController extends Controller
{
    public function index(WorkspaceListRequest $request): AnonymousResourceCollection
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        // Bounded and idempotent: ordinary workspace traffic is sufficient to
        // activate due Series occurrences; no cron or queue worker is required.
        app(PlannedOccurrenceActivator::class)->activateDue(now(), 25);
        $contents = app(ContentAccess::class)->visibleTo($request->user())
            ->with(['comments.user', 'series:id,name'])
            ->when($request->filled('project_id'), fn ($q) => $q->where('project_id', $request->integer('project_id')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')->toString()))
            ->when($request->filled('target_audience'), function ($query) use ($request): void {
                $audience = $request->string('target_audience')->toString();
                $query->where(fn ($nested) => $nested
                    ->where('payload->targetAudience', $audience)
                    ->orWhereJsonContains('payload->targetAudiences', $audience));
            })
            ->when($request->input('owner') === 'me', fn ($q) => $q->where('owner_id', $request->user()->id))
            ->when($request->filled('status'), fn ($q) => $request->input('status') === 'open'
                ? $q->whereNotIn('status', ['published', 'archived', 'rejected', 'completed', 'cancelled']) : $q->where('status', $request->input('status')))
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('type', 'like', "%{$search}%")
                        ->orWhere('status', 'like', "%{$search}%");
                });
            })
            ->orderBy($request->input('sort', 'created_at'), $request->input('direction', 'desc'))
            ->orderBy('id', $request->input('direction', 'desc'))
            ->paginate($request->integer('per_page', 20))->withQueryString();

        return ContentResource::collection($contents);
    }

    public function store(ContentRequest $request): JsonResponse
    {
        $content = app(ContentCreator::class)->create(
            $request->user(),
            $request->all(),
            $request->validated(),
        );

        return (new ContentResource($content->load(['comments.user', 'series:id,name'])))->response()->setStatusCode(201);
    }

    public function show(Request $request, Content $content): ContentResource
    {
        abort_unless(app(ContentAccess::class)->canView($request->user(), $content), 403);

        return new ContentResource($content->load(['comments.user', 'series:id,name']));
    }

    public function update(ContentRequest $request, Content $content): ContentResource
    {
        return DB::transaction(function () use ($request, $content) {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            if ($request->has('projectId') && (string) $request->input('projectId') !== (string) ($content->project_id ?? '')) {
                app(ActiveProjectGuard::class)->project($request->input('projectId'));
            }
            if ($request->has('stages')) {
                $request->merge(['stages' => app(ContentAssetRelations::class)
                    ->normalize($request->user(), $content, (array) $request->input('stages', []))]);
            }
            app(ContentAccess::class)->guardEdit($request->user(), $content, $request->all());
            $before = ['title' => $content->title, 'status' => $content->status,
                'deadline' => $content->deadline?->toDateString(), 'owner_id' => $content->owner_id,
                'project_id' => $content->project_id, 'reviewer_ids' => array_values($content->payload['reviewerIds'] ?? []),
                'workflow_structure' => collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage))
                    ->map(fn ($stage) => ['id' => $stage['id'] ?? null, 'order' => $stage['order'] ?? null,
                        'reviewerId' => $stage['reviewerId'] ?? null])->values()->all()];
            app(ContentPublication::class)->guardGenericWrite($request->all(), $content);
            ContentStatusPolicy::guardTransition($content->status, $request->input('status'));
            $this->guardCodeChange($request->user(), $content, $request->input('code'));
            if ($request->has('stages') && $request->has('reviewVersion')) {
                abort_unless(hash_equals(ContentReview::version($content), $request->input('reviewVersion')), 409, 'مراحل محتوا تغییر کرده‌اند؛ اطلاعات جدید را بررسی کنید.');
            }
            app(ContentReview::class)->guardGeneric($request->all(), $content, $request->user());
            $mergedPayload = [...($content->payload ?? []), 'title' => $content->title, 'type' => $content->type,
                'status' => $content->status, 'ownerId' => $content->owner_id, 'projectId' => $content->project_id,
                'deadline' => $content->deadline?->toDateString(), ...app(ContentWriteHistory::class)->apply($request->user(), $request->all(), $content)];
            $content->update($this->attributes($request->validated(), $mergedPayload));
            app(ContentAssetRelations::class)->sync($request->user(), $content->refresh());
            app(ContentStageTaskSync::class)->sync($content->refresh());
            $content->refresh();
            $after = ['title' => $content->title, 'status' => $content->status,
                'deadline' => $content->deadline?->toDateString(), 'owner_id' => $content->owner_id,
                'project_id' => $content->project_id, 'reviewer_ids' => array_values($content->payload['reviewerIds'] ?? []),
                'workflow_structure' => collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage))
                    ->map(fn ($stage) => ['id' => $stage['id'] ?? null, 'order' => $stage['order'] ?? null,
                        'reviewerId' => $stage['reviewerId'] ?? null])->values()->all()];
            $changes = [];
            foreach ($before as $field => $value) {
                if ($value != $after[$field]) {
                    $changes[] = ['field' => $field, 'from' => $value, 'to' => $after[$field]];
                }
            }
            if ($changes) {
                $eventId = (string) Str::uuid();
                ActivityLog::create(['user_id' => $request->user()->id, 'project_id' => $content->project_id,
                    'type' => 'content_updated', 'action' => 'ویرایش اطلاعات مهم محتوا', 'details' => 'content:'.$content->id,
                    'metadata' => ['eventId' => $eventId, 'recordType' => 'content', 'recordId' => (string) $content->id, 'changes' => $changes]]);
                if ($before['status'] !== $after['status']) {
                    app(ContentWatchNotifier::class)->meaningful($content, $request->user(), 'status:'.$eventId,
                        'وضعیت محتوای «'.$content->title.'» به «'.$content->status.'» تغییر کرد.');
                } elseif (collect($changes)->pluck('field')->intersect(['owner_id', 'reviewer_ids', 'workflow_structure'])->isNotEmpty()) {
                    app(ContentWatchNotifier::class)->meaningful($content, $request->user(), 'assignment:'.$eventId,
                        'مسئولیت یا ساختار جریان محتوای «'.$content->title.'» تغییر کرد.');
                }
            }

            return new ContentResource($content->load(['comments.user', 'series:id,name']));
        });
    }

    public function publish(PublicationCommandRequest $request, Content $content, ContentPublication $publication)
    {
        $data = $request->validated();
        $content = $publication->publish($request->user(), $content, $data['expectedVersion']);

        return $this->publicationResponse($request, $content, $publication);
    }

    public function unpublish(PublicationCommandRequest $request, Content $content, ContentPublication $publication)
    {
        $data = $request->validated();
        $content = $publication->unpublish($request->user(), $content, $data['expectedVersion']);

        return $this->publicationResponse($request, $content, $publication);
    }

    public function publicationSettings(PublicationSettingsRequest $request, Content $content, ContentPublication $publication)
    {
        $data = $request->validated();
        $content = $publication->schedule($request->user(), $content, $data);

        return response()->json(['data' => new ContentResource($content)]);
    }

    public function publicationTask(PublicationTaskRequest $request, Content $content, ContentPublication $publication)
    {
        $data = $request->validated();
        $task = $publication->createTask($request->user(), $content, $data);

        return response()->json(['data' => new TaskResource($task->load(['comments.user', 'attachments', 'activityLogs']))], $task->wasRecentlyCreated ? 201 : 200);
    }

    private function publicationResponse(Request $request, Content $content, ContentPublication $publication)
    {
        $tasks = $request->user()->hasPermission('tasks.view')
            ? $publication->targets($content)->with(['comments.user', 'attachments', 'activityLogs'])->get() : collect();

        return response()->json(['data' => ['content' => new ContentResource($content), 'tasks' => TaskResource::collection($tasks)]]);
    }

    /**
     * The ordinary delete is an archive: history, DAM relations, tasks and
     * comments survive and `previous_status` keeps the restorable status.
     */
    public function destroy(ContentRequest $request, Content $content): Response
    {
        app(ContentAccess::class)->guardEdit($request->user(), $content, []);
        app(ContentArchive::class)->archive($request->user(), $content);

        return response()->noContent();
    }

    /**
     * Permanent delete. Dedicated-permission only, explicit, audited, and refused
     * while dangerous dependencies (publication, DAM relations, open tasks) remain.
     */
    public function forceDestroy(ContentRequest $request, Content $content): Response
    {
        $actor = $request->user();
        abort_unless($actor?->isActive() && $actor->hasPermission('content.force_delete'), 403,
            'حذف دائمی محتوا فقط با مجوز اختصاصی content.force_delete مجاز است.');
        app(ContentArchive::class)->forceDelete($actor, $content);

        return response()->noContent();
    }

    private function attributes(array $validated, array $payload): array
    {
        return [
            'title' => $validated['title'] ?? $payload['title'],
            'type' => $validated['type'] ?? $payload['type'],
            'status' => $validated['status'] ?? ($payload['status'] ?? 'idea'),
            'deadline' => $validated['deadline'] ?? ($payload['deadline'] ?? null),
            'owner_id' => $validated['ownerId'] ?? ($payload['ownerId'] ?? null),
            'project_id' => $validated['projectId'] ?? ($payload['projectId'] ?? null),
            'payload' => Arr::except($payload, ['id', 'comments', 'createdAt', 'updatedAt', 'publicationVersion', 'reviewVersion', 'reviewableStageIds', 'access']),
        ];
    }

    /**
     * The stable code is a server decision. An explicit request is honoured only
     * while it is free; otherwise the next code of the series is allocated.
     */
    private function applyCode(Content $content, mixed $requested, array $payload): string
    {
        if ($content->code !== null && $content->code !== '') {
            return (string) $content->code;
        }

        return app(ContentCodeAllocator::class)->assign($content, $requested, $payload);
    }

    /** Codes are immutable for ordinary editors; only workflow managers may re-issue one. */
    private function guardCodeChange(User $actor, Content $content, mixed $requested): void
    {
        if ($requested === null) {
            return;
        }
        $normalized = ContentCodePolicy::normalize($requested);
        if ($normalized === null) {
            return; // Rejected by the request rules.
        }
        $current = $content->code;
        if ($current !== null && $current !== '' && $current === $normalized) {
            return;
        }
        // Only the workflow manager (not every ordinary editor) may re-issue a code.
        abort_unless($actor->hasPermission('content.workflow.manage'), 403, 'کد محتوا پس از ثبت قابل تغییر نیست.');
        abort_if(Content::query()->where('code', $normalized)->whereKeyNot($content->id)->exists(), 409, 'این کد پیش‌تر برای محتوای دیگری ثبت شده است.');
    }
}
