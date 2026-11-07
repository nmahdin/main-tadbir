<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedRole;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over OrganizationRoleService (Stage 03B). Listing and
 * assignment only — organization custom roles are a deferred slice
 * (ADR-0004 §7), and nothing here touches workspace data.
 */
class OrganizationRoleController extends Controller
{
    public function __construct(
        private readonly MembershipPermissions $permissions,
        private readonly OrganizationRoleService $roles,
    ) {
    }

    public function index(Request $request, Organization $organization): JsonResponse
    {
        if (! $this->permissions->userHasOrganizationPermission($request->user(), $organization, 'organization.roles.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $roles = ScopedRole::where('organization_id', $organization->id)
            ->with('permissions')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $roles->map(fn (ScopedRole $role): array => [
            'id' => $role->id,
            'key' => $role->key,
            'name' => $role->name,
            'scope' => $role->scope,
            'workspace_id' => $role->workspace_id,
            'organization_id' => $role->organization_id,
            'is_protected' => $role->is_protected,
            'permission_keys' => $role->permissionKeys(),
        ])]);
    }

    public function assign(Request $request, Organization $organization, OrganizationMembership $membership): JsonResponse
    {
        abort_unless((int) $membership->organization_id === (int) $organization->id, 404);

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
}
