<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Http\Resources\TeamResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class TeamController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $teams = Team::query()
            ->with(['users', 'department'])
            ->orderBy('name')
            ->get();

        return TeamResource::collection($teams);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $team = Team::create($this->attributes($data));
        $this->syncMembers($team, $data['memberIds'] ?? []);

        return (new TeamResource($team->load(['users', 'department'])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Team $team): TeamResource
    {
        $data = $this->validated($request, $team);

        $payload = array_merge($team->payload ?? [], $this->payloadAttributes($data));

        $team->update([
            ...$this->attributes($data, $team),
            'payload' => $payload,
        ]);

        if (array_key_exists('memberIds', $data)) {
            $this->syncMembers($team, $data['memberIds']);
        }

        return new TeamResource($team->refresh()->load(['users', 'department']));
    }

    public function destroy(Team $team): Response
    {
        $team->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Team $team = null): array
    {
        return Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'leaderId' => ['sometimes', 'nullable', 'integer'],
            'type' => ['sometimes', 'nullable', 'string', 'max:40'],
            'departmentId' => ['sometimes', 'nullable', 'integer'],
            'department' => ['sometimes', 'nullable', 'string', 'max:120'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'status' => ['sometimes', 'nullable', 'string', 'max:20'],
            'memberIds' => ['sometimes', 'array'],
            'projectIds' => ['sometimes', 'array'],
        ])->validate();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data, ?Team $team = null): array
    {
        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? $team?->description,
            'leader_id' => isset($data['leaderId']) && is_numeric($data['leaderId']) ? (int) $data['leaderId'] : null,
            'type' => in_array($data['type'] ?? null, ['permanent', 'temporary', 'project_based'], true)
                ? $data['type']
                : ($team?->type ?? 'permanent'),
            'department_id' => isset($data['departmentId']) && is_numeric($data['departmentId']) ? (int) $data['departmentId'] : $team?->department_id,
            'color' => $data['color'] ?? $team?->color ?? '#10b981',
            'status' => in_array($data['status'] ?? null, ['active', 'archived'], true) ? $data['status'] : ($team?->status ?? 'active'),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function payloadAttributes(array $data): array
    {
        $payload = [];

        if (array_key_exists('projectIds', $data) && is_array($data['projectIds'])) {
            $payload['projectIds'] = array_values(array_map(strval(...), $data['projectIds']));
        }

        if (array_key_exists('department', $data) && is_string($data['department'])) {
            $payload['department'] = $data['department'];
        }

        return $payload;
    }

    private function syncMembers(Team $team, array $memberIds): void
    {
        $ids = collect($memberIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values();

        $team->users()->sync($ids->all());
    }
}
