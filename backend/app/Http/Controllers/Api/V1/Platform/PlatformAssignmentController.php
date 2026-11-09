<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Platform\PlatformAssignmentService;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Platform role assignments API (Stage C2-3). Thin adapter over
 * PlatformAssignmentService: grant, soft revoke and atomic
 * replacement with all C2-2 invariants (ceiling, self-modification,
 * primary eligibility, final-primary guard, audit) enforced by the
 * service. Historical (revoked) records are preserved and listed
 * only through the assignments history filter.
 */
final class PlatformAssignmentController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.admins.view');

        $assignments = PlatformRoleAssignment::query()
            ->with(['user', 'role'])
            ->when($request->boolean('include_revoked') !== true, fn ($query) => $query->whereNull('revoked_at'))
            ->when($request->integer('user_id'), fn ($query, int $userId) => $query->where('user_id', $userId))
            ->when($request->integer('platform_role_id'), fn ($query, int $roleId) => $query->where('platform_role_id', $roleId))
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json([
            'data' => collect($assignments->items())->map(fn (PlatformRoleAssignment $assignment): array => $this->assignmentData($assignment))->all(),
            'meta' => [
                'current_page' => $assignments->currentPage(),
                'per_page' => $assignments->perPage(),
                'total' => $assignments->total(),
                'last_page' => $assignments->lastPage(),
            ],
        ]);
    }

    public function store(Request $request, PlatformAssignmentService $assignments): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'platform_role_id' => ['required', 'integer', Rule::exists('platform_roles', 'id')],
        ]);

        return $this->platformRespond(function () use ($actor, $data, $assignments): JsonResponse {
            $assignment = $assignments->grant(
                $actor,
                User::findOrFail($data['user_id']),
                PlatformRole::findOrFail($data['platform_role_id']),
            );

            return response()->json(['data' => $this->assignmentData($assignment->load(['user', 'role']))], 201);
        });
    }

    public function revoke(Request $request, PlatformRoleAssignment $assignment, PlatformAssignmentService $assignments): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');

        return $this->platformRespond(function () use ($actor, $assignment, $assignments): JsonResponse {
            $revoked = $assignments->revoke($actor, $assignment);

            return response()->json(['data' => $this->assignmentData($revoked->load(['user', 'role']))]);
        });
    }

    public function replace(Request $request, PlatformRoleAssignment $assignment, PlatformAssignmentService $assignments): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');
        $data = $request->validate([
            'platform_role_id' => ['required', 'integer', Rule::exists('platform_roles', 'id')],
        ]);

        return $this->platformRespond(function () use ($actor, $data, $assignment, $assignments): JsonResponse {
            $replacement = $assignments->replace(
                $actor,
                $assignment->user()->firstOrFail(),
                PlatformRole::findOrFail($data['platform_role_id']),
            );

            return response()->json(['data' => $this->assignmentData($replacement->load(['user', 'role']))]);
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function assignmentData(PlatformRoleAssignment $assignment): array
    {
        return [
            'id' => $assignment->id,
            'user' => [
                'id' => $assignment->user->id,
                'name' => $assignment->user->name,
                'username' => $assignment->user->username,
                'status' => $assignment->user->status,
            ],
            'role' => [
                'id' => $assignment->role->id,
                'key' => $assignment->role->key,
                'name' => $assignment->role->name,
            ],
            'granted_by_user_id' => $assignment->granted_by_user_id,
            'revoked_by_user_id' => $assignment->revoked_by_user_id,
            'revoked_at' => $assignment->revoked_at?->toIso8601String(),
            'created_at' => $assignment->created_at?->toIso8601String(),
        ];
    }
}
