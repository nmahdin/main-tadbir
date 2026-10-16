<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Organizations\Organization;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only platform organization directory (Stage C2-3).
 * Organization-level fields only — never embedded workspaces or
 * operational records. Suspension is a C3 capability and is not
 * exposed here.
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
}
