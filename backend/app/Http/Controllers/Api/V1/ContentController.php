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
use App\Models\Content;
use App\Services\ContentAccess;
use App\Services\ContentPublication;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use App\Services\ContentWriteHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ContentController extends Controller
{
    public function index(WorkspaceListRequest $request): AnonymousResourceCollection
    {
        abort_unless(app(ContentAccess::class)->canEnter($request->user()), 403);
        $contents = app(ContentAccess::class)->visibleTo($request->user())
            ->with('comments.user')
            ->when($request->filled('project_id'), fn ($q) => $q->where('project_id', $request->integer('project_id')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')->toString()))
            ->when($request->filled('target_audience'), fn ($q) => $q->where('payload->targetAudience', $request->string('target_audience')->toString()))
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
        app(ContentPublication::class)->guardGenericWrite($request->all(), null);
        app(ContentReview::class)->guardGeneric($request->all(), null, $request->user());
        $content = DB::transaction(function () use ($request) {
            $content = Content::create($this->attributes($request->validated(), app(ContentWriteHistory::class)->apply($request->user(), $request->all(), null)));
            app(ContentStageTaskSync::class)->sync($content);

            return $content;
        });

        return (new ContentResource($content->refresh()->load('comments.user')))->response()->setStatusCode(201);
    }

    public function show(Request $request, Content $content): ContentResource
    {
        abort_unless(app(ContentAccess::class)->canView($request->user(), $content), 403);

        return new ContentResource($content->load('comments.user'));
    }

    public function update(ContentRequest $request, Content $content): ContentResource
    {
        return DB::transaction(function () use ($request, $content) {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            app(ContentAccess::class)->guardEdit($request->user(), $content, $request->all());
            app(ContentPublication::class)->guardGenericWrite($request->all(), $content);
            if ($request->has('stages') && $request->has('reviewVersion')) {
                abort_unless(hash_equals(ContentReview::version($content), $request->input('reviewVersion')), 409, 'مراحل محتوا تغییر کرده‌اند؛ اطلاعات جدید را بررسی کنید.');
            }
            app(ContentReview::class)->guardGeneric($request->all(), $content, $request->user());
            $mergedPayload = [...($content->payload ?? []), 'title' => $content->title, 'type' => $content->type,
                'status' => $content->status, 'ownerId' => $content->owner_id, 'projectId' => $content->project_id,
                'deadline' => $content->deadline?->toDateString(), ...app(ContentWriteHistory::class)->apply($request->user(), $request->all(), $content)];
            $content->update($this->attributes($request->validated(), $mergedPayload));
            app(ContentStageTaskSync::class)->sync($content->refresh());

            return new ContentResource($content->refresh()->load('comments.user'));
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

    public function destroy(Content $content): Response
    {
        $content->delete();

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
}
