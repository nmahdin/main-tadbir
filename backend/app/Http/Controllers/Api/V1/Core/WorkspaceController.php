<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceAccess;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over the Core workspace foundation (Stage 03A).
 *
 * Visibility uses WorkspaceAccess only; no operational data of any module
 * is exposed or authorized here.
 */
class WorkspaceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $workspaces = Workspace::query()
            ->where('status', 'active')
            ->where(function ($query) use ($user): void {
                $query->where('owner_user_id', $user->id)
                    ->orWhereHas('memberships', fn ($memberships) => $memberships
                        ->where('user_id', $user->id)
                        ->where('status', MembershipStatus::Active->value));
            })
            ->orderBy('name')
            ->get()
            ->filter(fn (Workspace $workspace): bool => app(WorkspaceAccess::class)->canAccess($user, $workspace))
            ->values();

        return response()->json(['data' => $workspaces]);
    }

    public function store(Request $request, PersonalWorkspaceProvisioner $provisioner): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
        ]);

        if (isset($data['name'])) {
            $workspace = $provisioner->createAdditional($request->user(), $data['name']);
        } else {
            $workspace = $provisioner->ensureDefault($request->user());
        }

        return response()->json(['data' => $workspace], 201);
    }

    public function show(Request $request, Workspace $workspace, WorkspaceAccess $access): JsonResponse
    {
        abort_unless($access->canAccess($request->user(), $workspace), 403);

        return response()->json(['data' => $workspace]);
    }
}
