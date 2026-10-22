<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Audit\AuditLog;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only platform audit access (Stage C2-3) over the C1
 * append-only `audit_logs`. Summaries are returned exactly as
 * stored — they were masked by AuditWriter before persistence, so
 * no secret, token, or unredacted payload can be disclosed here,
 * and this endpoint exposes no write path of any kind.
 */
final class PlatformAuditController extends Controller
{
    use AuthorizesPlatformRequests;

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.audit.view');

        $logs = AuditLog::query()
            ->when($request->string('action')->toString(), fn ($query, string $action) => $query->where('action', $action))
            ->when($request->integer('actor_user_id'), fn ($query, int $actorId) => $query->where('actor_user_id', $actorId))
            ->when($request->string('target_type')->toString(), fn ($query, string $type) => $query->where('target_type', $type))
            ->when($request->integer('target_id'), fn ($query, int $targetId) => $query->where('target_id', $targetId))
            ->when($request->date('date_from'), fn ($query, $from) => $query->where('created_at', '>=', $from))
            ->when($request->date('date_to'), fn ($query, $to) => $query->where('created_at', '<=', $to))
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json([
            'data' => collect($logs->items())->map(fn (AuditLog $log): array => [
                'id' => $log->id,
                'action' => $log->action,
                'actor_user_id' => $log->actor_user_id,
                'scope_type' => $log->scope_type,
                'scope_id' => $log->scope_id,
                'target_type' => $log->target_type,
                'target_id' => $log->target_id,
                'summary' => $log->summary,
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ],
        ]);
    }
}
