<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Messaging\CoreSystemMessageDelivery;
use App\Core\Messaging\SystemMessageService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Consumer inbox + per-message actions for SYS-MSG. Read and
 * acknowledgment are independent POSTs.
 */
final class SystemMessageController extends Controller
{
    public function __construct(private readonly SystemMessageService $service) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = max(1, min($request->integer('per_page', 20), 100));
        $unreadOnly = $request->boolean('unread', false);

        $page = $this->service->inboxForUser($user, $unreadOnly, $perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (CoreSystemMessageDelivery $d): array => [
                'delivery_id' => $d->id,
                'message_id' => $d->message_id,
                'version' => $d->version,
                'slug' => $d->message->slug,
                'title' => $d->message->title,
                'body_markdown' => $d->message->body_markdown,
                'cta_label' => $d->message->cta_label,
                'cta_link' => $d->message->cta_link,
                'category' => $d->message->category,
                'audience' => $d->message->audience,
                'ack_required' => (bool) $d->message->ack_required,
                'first_delivered_at' => $d->first_delivered_at?->toIso8601String(),
                'read_at' => $d->read_at?->toIso8601String(),
                'acknowledged_at' => $d->acknowledged_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'pending_ack_count' => $this->service->pendingAcksForUser($user)->count(),
                'unread_count' => CoreSystemMessageDelivery::query()->forUser($user->id)->unread()->count(),
            ],
        ]);
    }

    public function markRead(CoreSystemMessageDelivery $delivery, Request $request): JsonResponse
    {
        if ((int) $delivery->user_id !== (int) $request->user()->id) {
            abort(404);
        }
        $delivery = $this->service->markRead($delivery);
        return response()->json(['data' => ['delivery_id' => $delivery->id, 'read_at' => $delivery->read_at?->toIso8601String()]]);
    }

    public function acknowledge(CoreSystemMessageDelivery $delivery, Request $request): JsonResponse
    {
        if ((int) $delivery->user_id !== (int) $request->user()->id) {
            abort(404);
        }
        $delivery = $this->service->acknowledge($request->user(), $delivery);
        return response()->json(['data' => [
            'delivery_id' => $delivery->id,
            'acknowledged_at' => $delivery->acknowledged_at?->toIso8601String(),
            'evidence_hash' => $delivery->ack_evidence_hash,
        ]]);
    }

    public function pendingAcks(Request $request): JsonResponse
    {
        $user = $request->user();
        $pendings = $this->service->pendingAcksForUser($user);
        return response()->json(['data' => $pendings->map(fn (CoreSystemMessageDelivery $d): array => [
            'delivery_id' => $d->id,
            'message_id' => $d->message_id,
            'version' => $d->version,
            'slug' => $d->message->slug,
            'title' => $d->message->title,
            'body_markdown' => $d->message->body_markdown,
            'ack_policy_version' => $d->message->ack_policy_version,
        ])->all()]);
    }
}
