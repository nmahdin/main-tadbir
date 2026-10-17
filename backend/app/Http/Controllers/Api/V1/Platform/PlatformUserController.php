<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Platform\PlatformRoleAssignment;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only platform user directory (Stage C2-3). Exposes only the
 * fields platform administration needs; no workspace data, no
 * contact details beyond the account identity itself.
 */
final class PlatformUserController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.users.view');

        $users = User::query()
            ->when($request->string('status')->toString(), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('username', 'like', "%{$search}%");
                });
            })
            ->orderBy('id')
            ->paginate($this->perPage($request));

        $roleKeys = PlatformRoleAssignment::query()
            ->whereIn('user_id', collect($users->items())->pluck('id')->all())
            ->whereNull('revoked_at')
            ->with('role')
            ->get()
            ->keyBy('user_id');

        return response()->json([
            'data' => collect($users->items())->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'status' => $user->status,
                'platform_role' => $roleKeys->get($user->id)?->role?->key,
                'created_at' => $user->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'last_page' => $users->lastPage(),
            ],
        ]);
    }
}
