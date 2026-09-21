<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\WorkspaceRecordRequest;
use App\Http\Resources\WorkspaceRecordResource;
use App\Models\WorkspaceRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;

class WorkspaceRecordController extends Controller
{
    /**
     * @var array<string, array{view: string, create: string, edit: string, delete: string}>
     */
    private const PERMISSIONS = [
        WorkspaceRecord::KIND_IDEA => [
            'view' => 'thinktank.view',
            'create' => 'thinktank.create_idea',
            'edit' => 'thinktank.edit_idea',
            'delete' => 'thinktank.delete_idea',
        ],
        WorkspaceRecord::KIND_MEETING => [
            'view' => 'thinktank.view',
            'create' => 'thinktank.manage_meetings',
            'edit' => 'thinktank.manage_meetings',
            'delete' => 'thinktank.manage_meetings',
        ],
        WorkspaceRecord::KIND_LETTER => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.create_letter',
            'edit' => 'secretariat.edit_letter',
            'delete' => 'secretariat.edit_letter',
        ],
        WorkspaceRecord::KIND_RESOLUTION => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.manage_resolutions',
            'edit' => 'secretariat.manage_resolutions',
            'delete' => 'secretariat.manage_resolutions',
        ],
        WorkspaceRecord::KIND_DOSSIER => [
            'view' => 'secretariat.view',
            'create' => 'secretariat.archive_letter',
            'edit' => 'secretariat.archive_letter',
            'delete' => 'secretariat.archive_letter',
        ],
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $kind = $this->kind($request);
        $this->authorizePermission($request, $kind, 'view');

        $records = WorkspaceRecord::query()
            ->where('kind', $kind)
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('title', 'like', "%{$search}%")
                        ->orWhere('status', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100));

        return WorkspaceRecordResource::collection($records);
    }

    public function store(WorkspaceRecordRequest $request): JsonResponse
    {
        $kind = $this->kind($request);
        $this->authorizePermission($request, $kind, 'create');

        $record = WorkspaceRecord::create($this->attributes($request, $kind));

        return (new WorkspaceRecordResource($record))->response()->setStatusCode(201);
    }

    public function show(Request $request, WorkspaceRecord $workspaceRecord): WorkspaceRecordResource
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->authorizePermission($request, $kind, 'view');

        return new WorkspaceRecordResource($workspaceRecord);
    }

    public function update(WorkspaceRecordRequest $request, WorkspaceRecord $workspaceRecord): WorkspaceRecordResource
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->authorizePermission($request, $kind, 'edit');

        $merged = [...($workspaceRecord->payload ?? []), ...$request->all()];
        $workspaceRecord->update($this->attributes($request, $kind, $merged));

        return new WorkspaceRecordResource($workspaceRecord->refresh());
    }

    public function destroy(Request $request, WorkspaceRecord $workspaceRecord): Response
    {
        $kind = $this->kind($request);
        abort_unless($workspaceRecord->kind === $kind, 404);
        $this->authorizePermission($request, $kind, 'delete');
        $workspaceRecord->delete();

        return response()->noContent();
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>
     */
    private function attributes(Request $request, string $kind, ?array $payload = null): array
    {
        $payload ??= $request->all();
        $owner = $payload['creatorId']
            ?? $payload['organizerId']
            ?? $payload['senderUserId']
            ?? $payload['responsibleUserId']
            ?? $request->user()?->id;

        return [
            'kind' => $kind,
            'title' => $payload['title'] ?? $payload['subject'] ?? '',
            'status' => $payload['status'] ?? null,
            'owner_id' => is_numeric($owner) ? (int) $owner : $request->user()?->id,
            'payload' => Arr::except($payload, ['id', 'createdAt', 'updatedAt']),
        ];
    }

    private function kind(Request $request): string
    {
        return (string) $request->route('kind');
    }

    private function authorizePermission(Request $request, string $kind, string $action): void
    {
        $permission = self::PERMISSIONS[$kind][$action] ?? null;
        abort_unless($permission && $request->user()?->hasAnyPermission($permission), 403, 'دسترسی لازم برای این بخش را ندارید.');
    }
}
