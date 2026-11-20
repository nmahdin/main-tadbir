<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Inbox\ActionInboxService;
use App\Core\Inbox\CoreActionItem;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Consumer (me-scoped) inbox for CORE-REQ. Authenticated users list
 * their own open/resolved action items and badge counts. No action
 * execution endpoint is exposed — the origin module is authoritative.
 */
final class InboxController extends Controller
{
    public function __construct(
        private readonly ActionInboxService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = CoreActionItem::query()->forUser($user);

        if ($scope = $request->string('status')->toString()) {
            if ($scope === 'open') {
                $q->open();
            } elseif ($scope === 'overdue') {
                $q->overdue();
            } elseif ($scope === 'resolved') {
                $q->whereNotNull('resolved_at');
            }
        } else {
            $q->open();
        }

        $perPage = max(1, min($request->integer('per_page', 20), 100));
        $page = $q->orderByRaw("CASE urgency WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->orderBy('due_at', 'asc')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (CoreActionItem $i): array => $this->serialize($i))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'unresolved_count' => $this->service->unresolvedCountForUser($user),
            ],
        ]);
    }

    public function show(CoreActionItem $item, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! CoreActionItem::query()->whereKey($item->id)->forUser($user)->exists()) {
            abort(404);
        }
        return response()->json(['data' => $this->serialize($item)]);
    }

    /**
     * Client-initiated dismissal of a BLOCKED/RESOLVABLE item. The
     * controller refuses to execute any command on the origin module.
     * It only marks the inbox row resolved with a user-source label.
     */
    public function dismiss(CoreActionItem $item, Request $request): JsonResponse
    {
        $user = $request->user();
        if (! CoreActionItem::query()->whereKey($item->id)->forUser($user)->exists()) {
            abort(404);
        }
        // User can only dismiss items directly assigned to them.
        if ($item->recipient_user_id !== $user->id) {
            return response()->json(['message' => 'Only the assignee can dismiss this item.', 'code' => 'not_assignee'], 403);
        }
        $item->resolve('user_dismiss', $user, null, app(\App\Core\Audit\AuditWriter::class));
        return response()->json(['data' => $this->serialize($item)]);
    }

    private function serialize(CoreActionItem $i): array
    {
        return [
            'id' => $i->id,
            'origin_key' => $i->originModuleKey(),
            'origin_module' => $i->origin_module,
            'origin_type' => $i->origin_type,
            'origin_id' => $i->origin_id,
            'action_kind' => $i->action_kind,
            'urgency' => $i->urgency,
            'title' => $i->title,
            'summary' => $i->summary,
            'deep_link' => $i->deep_link,
            'due_at' => $i->due_at?->toIso8601String(),
            'allowed_actions' => $i->allowed_actions,
            'recipient_scope' => $i->organization_id ? 'organization' : 'personal',
            'organization_id' => $i->organization_id,
            'is_overdue' => $i->isOverdue(),
            'resolved_at' => $i->resolved_at?->toIso8601String(),
            'created_at' => $i->created_at?->toIso8601String(),
        ];
    }
}
