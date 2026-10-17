<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedRole;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over WorkspaceRoleService (Stage 03B). Every rule —
 * scope/container match, grant ceiling, protected roles, final-manager
 * protection — lives in the service; this controller only authorizes
 * listing, validates input shape, and maps domain exceptions to the
 * API's 403/422 responses.
 */
class WorkspaceRoleController extends Controller
{
    public function __construct(
        private readonly MembershipPermissions $permissions,
        private readonly WorkspaceRoleService $roles,
    ) {
    }

    public function index(Request $request, Workspace $workspace): JsonResponse
    {
        if (! $this->permissions->userHasWorkspacePermission($request->user(), $workspace, 'workspace.roles.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $roles = ScopedRole::where('workspace_id', $workspace->id)
            ->with('permissions')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $roles->map(fn (ScopedRole $role): array => $this->present($role))]);
    }

    public function store(Request $request, Workspace $workspace): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'key' => ['sometimes', 'nullable', 'string', 'max:255', 'alpha_dash'],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string'],
        ]);

        try {
            $role = $this->roles->createCustomRole(
                $request->user(),
                $workspace,
                $data['name'],
                array_values($data['permissions']),
                $data['key'] ?? null,
            );
        } catch (RbacAuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (RbacValidationException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $this->present($role)], 201);
    }

    public function update(Request $request, Workspace $workspace, ScopedRole $role): JsonResponse
    {
        abort_unless((int) $role->workspace_id === (int) $workspace->id, 404);

        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string'],
        ]);

        try {
            $role = $this->roles->updateCustomRolePermissions($request->user(), $role, array_values($data['permissions']));
        } catch (RbacAuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (RbacValidationException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $this->present($role)]);
    }

    public function destroy(Request $request, Workspace $workspace, ScopedRole $role): JsonResponse
    {
        abort_unless((int) $role->workspace_id === (int) $workspace->id, 404);

        try {
            $this->roles->deleteCustomRole($request->user(), $role);
        } catch (RbacAuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (RbacValidationException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Role deleted.']);
    }

    public function assign(Request $request, Workspace $workspace, WorkspaceMembership $membership): JsonResponse
    {
        abort_unless((int) $membership->workspace_id === (int) $workspace->id, 404);

        $data = $request->validate([
            'role_id' => ['required', 'integer', 'exists:core_roles,id'],
        ]);

        try {
            $membership = $this->roles->assignRole(
                $request->user(),
                $membership,
                ScopedRole::findOrFail($data['role_id']),
            );
        } catch (RbacAuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (RbacValidationException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $membership->load('role')]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ScopedRole $role): array
    {
        return [
            'id' => $role->id,
            'key' => $role->key,
            'name' => $role->name,
            'scope' => $role->scope,
            'workspace_id' => $role->workspace_id,
            'organization_id' => $role->organization_id,
            'is_protected' => $role->is_protected,
            'permission_keys' => $role->permissionKeys(),
        ];
    }
}
