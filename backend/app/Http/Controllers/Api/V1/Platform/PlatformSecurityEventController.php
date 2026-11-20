<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Security\Events\SecurityEvent;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PlatformSecurityEventController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.security.manage');
        $perPage = max(1, min($request->integer('per_page', 50), 200));
        $q = SecurityEvent::query()->orderByDesc('occurred_at');
        if ($type = $request->query('event_type')) {
            $q->where('event_type', $type);
        }
        if ($actorId = $request->query('actor_user_id')) {
            $q->where('actor_user_id', (int) $actorId);
        }
        $page = $q->paginate($perPage);

        return response()->json([
            'data' => $page->items(),
            'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }
}
