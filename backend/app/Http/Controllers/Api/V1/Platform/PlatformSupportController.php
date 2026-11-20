<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Support\CoreSupportTicket;
use App\Core\Support\SupportTicketService;
use App\Core\Support\SupportTicketStatus;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use App\Models\User;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/**
 * Platform staff queue management. Both manage and agent permission
 * holders can access queue actions; manage permission is required for
 * reassignment across the whole queue and status transitions.
 */
final class PlatformSupportController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(
        private readonly SupportTicketService $service,
    ) {}

    public function queue(Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($request): JsonResponse {
            $actor = $this->platformActor($request, 'platform.support.agent');
            $q = CoreSupportTicket::query()->queue();
            if ($request->boolean('assigned_to_me')) {
                $q->where('assigned_user_id', $actor->id);
            }
            if ($priority = $request->string('priority')->toString()) {
                $q->where('priority', $priority);
            }
            $perPage = $this->perPage($request);
            $page = $q->with(['owner','assignee'])->paginate($perPage);

            return response()->json([
                'data' => collect($page->items())->map(fn (CoreSupportTicket $t): array => [
                    'id' => $t->id,
                    'reference' => $t->reference,
                    'subject' => $t->subject,
                    'category' => $t->category,
                    'status' => $t->status,
                    'priority' => $t->priority,
                    'owner' => $t->owner ? ['id' => $t->owner->id, 'name' => $t->owner->name] : null,
                    'assignee' => $t->assignee ? ['id' => $t->assignee->id, 'name' => $t->assignee->name] : null,
                    'created_at' => $t->created_at?->toIso8601String(),
                    'last_replied_at' => $t->last_replied_at?->toIso8601String(),
                ])->all(),
                'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
            ]);
        });
    }

    public function transition(CoreSupportTicket $supportTicket, Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($supportTicket, $request): JsonResponse {
            $actor = $this->platformActor($request, 'platform.support.manage');
            $validated = $request->validate([
                'status' => ['required', Rule::enum(SupportTicketStatus::class)],
            ]);
            try {
                $ticket = $this->service->transitionStatus($supportTicket, $actor, SupportTicketStatus::from($validated['status']));
            } catch (DomainException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => 'platform_operation_rejected'], 422);
            }
            return response()->json(['data' => ['id' => $ticket->id, 'status' => $ticket->status]]);
        });
    }

    public function assign(CoreSupportTicket $supportTicket, Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($supportTicket, $request): JsonResponse {
            $validated = $request->validate([
                'user_id' => ['nullable', 'integer', 'exists:users,id'],
            ]);
            $assignee = isset($validated['user_id']) ? User::query()->findOrFail((int) $validated['user_id']) : null;
            // An agent may claim an unassigned ticket for themself. Any
            // reassignment, unassignment or assigning another user requires
            // the distinct platform.support.manage permission.
            $selfClaim = $assignee !== null
                && (int) $assignee->id === (int) $request->user()->id
                && ($supportTicket->assigned_user_id === null
                    || (int) $supportTicket->assigned_user_id === (int) $assignee->id);
            $actor = $this->platformActor($request, $selfClaim ? 'platform.support.agent' : 'platform.support.manage');
            try {
                $ticket = $this->service->assign($supportTicket, $actor, $assignee);
            } catch (DomainException|InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => 'platform_operation_rejected'], 422);
            }
            return response()->json(['data' => ['id' => $ticket->id, 'assigned_user_id' => $ticket->assigned_user_id]]);
        });
    }
}
