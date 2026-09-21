<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContentRequest;
use App\Http\Resources\ContentResource;
use App\Models\Content;
use App\Services\ContentStageTaskSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;

class ContentController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $contents = Content::query()
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('type', 'like', "%{$search}%")
                        ->orWhere('status', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return ContentResource::collection($contents);
    }

    public function store(ContentRequest $request): JsonResponse
    {
        $content = Content::create($this->attributes($request->validated(), $request->all()));
        app(ContentStageTaskSync::class)->sync($content);

        return (new ContentResource($content->refresh()))->response()->setStatusCode(201);
    }

    public function show(Content $content): ContentResource
    {
        return new ContentResource($content);
    }

    public function update(ContentRequest $request, Content $content): ContentResource
    {
        $mergedPayload = [...($content->payload ?? []), ...$request->all()];
        $content->update($this->attributes($request->validated(), $mergedPayload));
        app(ContentStageTaskSync::class)->sync($content->refresh());

        return new ContentResource($content->refresh());
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
            'payload' => Arr::except($payload, ['id', 'createdAt', 'updatedAt']),
        ];
    }
}
