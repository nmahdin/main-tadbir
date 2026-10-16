<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Platform roles API (Stage C2-3). Thin adapter over
 * PlatformRoleService — all authorization, ceiling, protection and
 * audit rules live in the service.
 */
final class PlatformRoleController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.admins.view');

        $roles = PlatformRole::query()
            ->with('permissions')
            ->orderBy('key')
            ->paginate($this->perPage($request));

        return $this->rolePage($roles);
    }

    public function show(Request $request, PlatformRole $role): JsonResponse
    {
        $this->platformActor($request, 'platform.admins.view');

        return response()->json(['data' => $this->roleData($role->load('permissions'))]);
    }

    public function store(Request $request, PlatformRoleService $roles): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');
        $data = $request->validate([
            'key' => ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9_]*$/'],
            'name' => ['required', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'permissions' => ['present', 'array', 'max:100'],
            'permissions.*' => ['string', Rule::exists('core_permissions', 'key')],
        ]);

        return $this->platformRespond(function () use ($actor, $data, $roles): JsonResponse {
            $role = $roles->createCustomRole($actor, $data['key'], $data['name'], $data['permissions'], $data['description'] ?? null);

            return response()->json(['data' => $this->roleData($role)], 201);
        });
    }

    public function update(Request $request, PlatformRole $role, PlatformRoleService $roles): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'permissions' => ['sometimes', 'array', 'max:100'],
            'permissions.*' => ['string', Rule::exists('core_permissions', 'key')],
            'version' => ['required', 'integer', 'min:1'],
        ]);

        return $this->platformRespond(function () use ($actor, $data, $role, $roles): JsonResponse {
            $updated = $roles->updateCustomRole(
                $actor,
                $role,
                $data['name'] ?? null,
                $data['description'] ?? null,
                $data['permissions'] ?? null,
                (int) $data['version'],
            );

            return response()->json(['data' => $this->roleData($updated)]);
        });
    }

    public function destroy(Request $request, PlatformRole $role, PlatformRoleService $roles): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.admins.manage');

        return $this->platformRespond(function () use ($actor, $role, $roles): JsonResponse {
            $roles->deleteRole($actor, $role);

            return response()->json(['data' => ['deleted' => true]]);
        });
    }

    private function rolePage($roles): JsonResponse
    {
        return response()->json([
            'data' => collect($roles->items())->map(fn (PlatformRole $role): array => $this->roleData($role))->all(),
            'meta' => [
                'current_page' => $roles->currentPage(),
                'per_page' => $roles->perPage(),
                'total' => $roles->total(),
                'last_page' => $roles->lastPage(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function roleData(PlatformRole $role): array
    {
        return [
            'id' => $role->id,
            'key' => $role->key,
            'name' => $role->name,
            'description' => $role->description,
            'is_protected' => (bool) $role->is_protected,
            'version' => (int) $role->version,
            'permissions' => $role->permissions->pluck('key')->sort()->values()->all(),
        ];
    }
}
