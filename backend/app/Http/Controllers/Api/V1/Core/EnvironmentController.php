<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Platform\PlatformAuthorizer;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceAccess;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * UX-02-1 environment discovery (additive, read-only).
 *
 * One payload describing every application environment the signed-in
 * user may enter: the platform plane (C2 PlatformAuthorizer), their
 * organizations (active organizations with an ACTIVE membership, the
 * same visibility rule as OrganizationController@index), and their
 * workspaces (WorkspaceAccess visibility, exactly as
 * WorkspaceController@index). Suspended/ended organizations never
 * appear (C3 lifecycle); organization membership alone never exposes
 * an organization's workspaces (C1).
 *
 * This endpoint grants nothing: it reports the caller's existing
 * scoped role and effective permissions per environment so the shell
 * can render honest navigation. Every underlying API continues to
 * authorize each request independently.
 */
class EnvironmentController extends Controller
{
    public function index(
        Request $request,
        PlatformAuthorizer $platformAuthorizer,
        MembershipPermissions $membershipPermissions,
        WorkspaceAccess $workspaceAccess,
    ): JsonResponse {
        $user = $request->user();

        $organizations = Organization::query()
            ->where('status', 'active')
            ->whereHas('memberships', fn ($query) => $query
                ->where('user_id', $user->id)
                ->where('status', MembershipStatus::Active->value))
            ->with(['memberships' => fn ($query) => $query
                ->where('user_id', $user->id)
                ->where('status', MembershipStatus::Active->value)
                ->with('role')])
            ->orderBy('name')
            ->get();

        $organizationItems = $organizations->map(fn (Organization $organization): array => [
            'id' => $organization->id,
            'name' => $organization->name,
            'slug' => $organization->slug,
            'status' => $organization->status,
            'role' => $this->roleSummary($organization->memberships->first()?->role),
            'permissions' => $membershipPermissions->organizationPermissionKeys($user, $organization),
        ])->values();

        $workspaces = Workspace::query()
            ->where('status', 'active')
            ->where(function ($query) use ($user): void {
                $query->where('owner_user_id', $user->id)
                    ->orWhereHas('memberships', fn ($memberships) => $memberships
                        ->where('user_id', $user->id)
                        ->where('status', MembershipStatus::Active->value));
            })
            ->with([
                'organization',
                'memberships' => fn ($query) => $query
                    ->where('user_id', $user->id)
                    ->where('status', MembershipStatus::Active->value)
                    ->with('role'),
            ])
            ->orderBy('name')
            ->get()
            ->filter(fn (Workspace $workspace): bool => $workspaceAccess->canAccess($user, $workspace))
            ->values();

        $workspaceItems = $workspaces->map(fn (Workspace $workspace): array => [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'organization_id' => $workspace->organization_id,
            'organization_name' => $workspace->organization?->name,
            'is_default' => (bool) $workspace->is_default,
            'relation' => (int) $workspace->owner_user_id === (int) $user->id ? 'owner' : 'member',
            'role' => $this->roleSummary($workspace->memberships->first()?->role),
            'permissions' => $membershipPermissions->workspacePermissionKeys($user, $workspace),
        ])->values();

        $platformPermissions = $platformAuthorizer->permissionsFor($user);

        return response()->json([
            'data' => [
                'platform' => [
                    'eligible' => $platformAuthorizer->activeAssignment($user) !== null,
                    'is_primary' => $platformAuthorizer->isPrimaryAdministrator($user),
                    'permissions' => $platformPermissions,
                ],
                'organizations' => $organizationItems,
                'workspaces' => $workspaceItems,
            ],
        ]);
    }

    /**
     * @return array{key: string, name: string}|null
     */
    private function roleSummary(mixed $role): ?array
    {
        if ($role === null) {
            return null;
        }

        return ['key' => $role->key, 'name' => $role->name];
    }
}
