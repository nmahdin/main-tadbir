<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationLifecycleService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform organization directory and lifecycle administration
 * (Stages C2-3 and C3-2). Organization-level fields only — never
 * embedded workspaces or operational records.
 *
 * Detail view requires `platform.organizations.view`. Mutations
 * are thin adapters over OrganizationLifecycleService, which
 * re-evaluates the operation-specific permission, the legal
 * transition, and the expected status_version inside its own
 * transaction; this controller contributes only the endpoint
 * permission precheck, input validation, and error mapping.
 * Internal lifecycle reasons are never returned here: they live
 * in the audit trail (platform.audit.view) only.
 */
final class PlatformOrganizationController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.organizations.view');

        $organizations = Organization::query()
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            })
            ->orderBy('name')
            ->paginate($this->perPage($request));

        return response()->json([
            'data' => collect($organizations->items())->map(fn (Organization $organization): array => [
                'id' => $organization->id,
                'name' => $organization->name,
                'slug' => $organization->slug,
                'status' => $organization->status,
                'created_at' => $organization->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $organizations->currentPage(),
                'per_page' => $organizations->perPage(),
                'total' => $organizations->total(),
                'last_page' => $organizations->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, Organization $organization): JsonResponse
    {
        $this->platformActor($request, 'platform.organizations.view');

        return response()->json(['data' => $this->organizationData($organization)]);
    }

    public function suspend(Request $request, Organization $organization, OrganizationLifecycleService $lifecycle): JsonResponse
    {
        return $this->transition($request, $organization, 'platform.organizations.manage_status',
            fn ($actor, string $reason, int $version): Organization => $lifecycle->suspend($actor, $organization, $reason, $version));
    }

    public function reactivate(Request $request, Organization $organization, OrganizationLifecycleService $lifecycle): JsonResponse
    {
        return $this->transition($request, $organization, 'platform.organizations.manage_status',
            fn ($actor, string $reason, int $version): Organization => $lifecycle->reactivate($actor, $organization, $reason, $version));
    }

    public function end(Request $request, Organization $organization, OrganizationLifecycleService $lifecycle): JsonResponse
    {
        return $this->transition($request, $organization, 'platform.organizations.end',
            fn ($actor, string $reason, int $version): Organization => $lifecycle->end($actor, $organization, $reason, $version));
    }

    public function restore(Request $request, Organization $organization, OrganizationLifecycleService $lifecycle): JsonResponse
    {
        return $this->transition($request, $organization, 'platform.organizations.restore',
            fn ($actor, string $reason, int $version): Organization => $lifecycle->restoreEnded($actor, $organization, $reason, $version));
    }

    /**
     * @param  Closure(\App\Models\User, string, int): Organization  $operation
     */
    private function transition(Request $request, Organization $organization, string $permission, Closure $operation): JsonResponse
    {
        $actor = $this->platformActor($request, $permission);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
            'status_version' => ['required', 'integer', 'min:1'],
        ]);

        return $this->platformRespond(function () use ($actor, $data, $operation): JsonResponse {
            $updated = $operation($actor, $data['reason'], (int) $data['status_version']);

            return response()->json(['data' => $this->organizationData($updated)]);
        });
    }

    /**
     * Administrative organization detail. Lifecycle metadata
     * (states, timestamps, actor IDs, version) is exposed to
     * authorized platform viewers; transition reasons are not —
     * they remain available only through the audit trail.
     *
     * @return array<string, mixed>
     */
    private function organizationData(Organization $organization): array
    {
        return [
            'id' => $organization->id,
            'name' => $organization->name,
            'slug' => $organization->slug,
            'status' => $organization->status,
            'status_version' => (int) $organization->status_version,
            'suspended_at' => $organization->suspended_at?->toIso8601String(),
            'suspended_by_user_id' => $organization->suspended_by_user_id,
            'ended_at' => $organization->ended_at?->toIso8601String(),
            'ended_by_user_id' => $organization->ended_by_user_id,
            'created_at' => $organization->created_at?->toIso8601String(),
        ];
    }
}
