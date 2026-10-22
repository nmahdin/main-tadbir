<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over the Core organization foundation (Stage 03A).
 * Additive endpoints; no legacy route or behavior is changed.
 *
 * Organization responses contain organization-level information only.
 * Workspace collections are never embedded here: organization membership
 * alone does not grant visibility of an organization's workspaces, and
 * no organization-administrator privilege exists before Stage 03B.
 * Workspace data is exposed solely through WorkspaceController, where
 * WorkspaceAccess decides visibility workspace by workspace.
 */
class OrganizationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organizations = Organization::query()
            ->where('status', 'active')
            ->whereHas('memberships', fn ($query) => $query
                ->where('user_id', $request->user()->id)
                ->where('status', MembershipStatus::Active->value))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $organizations]);
    }

    public function store(Request $request, OrganizationProvisioner $provisioner): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', 'alpha_dash', 'unique:organizations,slug'],
        ]);

        $organization = $provisioner->create($request->user(), $data['name'], $data['slug'] ?? null);

        return response()->json(['data' => $organization], 201);
    }

    public function show(Request $request, Organization $organization): JsonResponse
    {
        $isActiveMember = $organization->isActive() && $organization->memberships()
            ->where('user_id', $request->user()->id)
            ->where('status', MembershipStatus::Active->value)
            ->exists();

        abort_unless($isActiveMember, 403);

        return response()->json(['data' => $organization]);
    }
}
