<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Support\CoreSupportAttachment;
use App\Core\Support\CoreSupportTicket;
use App\Core\Support\SupportTicketPriority;
use App\Core\Support\SupportTicketService;
use App\Core\Support\SupportTicketStatus;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Consumer endpoint for platform support: open tickets, list own
 * tickets, reply, download attachments by access_token. Platform
 * staff endpoints live under Platform\SupportController.
 */
final class SupportTicketController extends Controller
{
    public function __construct(
        private readonly SupportTicketService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAgent = $this->service->isSupportAgent($user);
        $q = CoreSupportTicket::query()->visibleTo($user, $isAgent)
            ->with('assignee');

        if ($status = $request->string('status')->toString()) {
            $q->where('status', $status);
        }
        if ($category = $request->string('category')->toString()) {
            $q->where('category', $category);
        }
        if ($isAgent && $request->has('assigned_to_me') && $request->boolean('assigned_to_me')) {
            $q->where('assigned_user_id', $user->id);
        }

        $perPage = max(1, min($request->integer('per_page', 20), 100));
        $page = $q->orderByDesc('created_at')->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())->map(fn (CoreSupportTicket $t): array => $this->serializeSummary($t))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function show(CoreSupportTicket $supportTicket, Request $request): JsonResponse
    {
        $user = $request->user();
        try {
            $this->service->assertCanView($supportTicket, $user);
        } catch (\DomainException $e) {
            abort(403, $e->getMessage());
        }

        $supportTicket->load(['messages', 'activity', 'attachments', 'assignee', 'owner']);

        $isAgent = $this->service->isSupportAgent($user);

        return response()->json(['data' => [
            'id' => $supportTicket->id,
            'reference' => $supportTicket->reference,
            'subject' => $supportTicket->subject,
            'category' => $supportTicket->category,
            'status' => $supportTicket->status,
            'priority' => $supportTicket->priority,
            'owner' => ['id' => $supportTicket->owner->id, 'name' => $supportTicket->owner->name],
            'assignee' => $supportTicket->assignee ? ['id' => $supportTicket->assignee->id, 'name' => $supportTicket->assignee->name] : null,
            'created_at' => $supportTicket->created_at?->toIso8601String(),
            'last_replied_at' => $supportTicket->last_replied_at?->toIso8601String(),
            'messages' => $supportTicket->messages
                ->filter(fn ($m) => $isAgent || $m->isVisibleToRequester())
                ->map(fn ($m): array => [
                    'id' => $m->id,
                    'author_role' => $m->author_role,
                    'author_name' => $m->author?->name,
                    'body' => $m->body,
                    'attachments' => $m->attachments,
                    'internal_note' => (bool) $m->internal_note,
                    'created_at' => $m->created_at?->toIso8601String(),
                ])->values(),
            'activity' => $isAgent ? $supportTicket->activity->map(fn ($a): array => [
                'id' => $a->id,
                'event_type' => $a->event_type,
                'payload' => $a->payload,
                'actor_name' => $a->actor?->name,
                'created_at' => $a->created_at?->toIso8601String(),
            ])->values() : [],
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'min:3', 'max:200'],
            'category' => ['required', Rule::in(SupportTicketService::ALLOWED_CATEGORIES)],
            'body' => ['required', 'string', 'min:2', 'max:20000'],
            'priority' => ['sometimes', Rule::in(['low','normal','high','urgent'])],
            'attachments.*' => ['sometimes', 'file', 'max:10240'],
        ]);

        $files = [];
        foreach ((array) $request->file('attachments', []) as $f) {
            $files[] = $f;
        }

        $ticket = $this->service->openTicket($request->user(), $validated, $files);
        return response()->json(['data' => $this->serializeSummary($ticket)], 201);
    }

    public function reply(CoreSupportTicket $supportTicket, Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:20000'],
            'internal_note' => ['sometimes', 'boolean'],
            'attachments.*' => ['sometimes', 'file', 'max:10240'],
        ]);

        $files = [];
        foreach ((array) $request->file('attachments', []) as $f) {
            $files[] = $f;
        }
        $internal = (bool) ($validated['internal_note'] ?? false);
        try {
            $this->service->addReply($supportTicket, $user, (string) $validated['body'], $internal, $files);
        } catch (\DomainException $e) {
            abort(403, $e->getMessage());
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => 'support_validation'], 422);
        }
        return response()->json(['data' => $this->serializeSummary($supportTicket->refresh())], 201);
    }

    public function download(string $token, Request $request): StreamedResponse
    {
        $att = $this->service->findAttachmentByToken($token);
        if (! $att) {
            abort(404);
        }
        try {
            return $this->service->streamAttachment($att, $request->user());
        } catch (\DomainException $e) {
            abort(403, $e->getMessage());
        }
    }

    private function serializeSummary(CoreSupportTicket $t): array
    {
        return [
            'id' => $t->id,
            'reference' => $t->reference,
            'subject' => $t->subject,
            'category' => $t->category,
            'status' => $t->status,
            'priority' => $t->priority,
            'owner_user_id' => $t->owner_user_id,
            'assigned_user_id' => $t->assigned_user_id,
            'created_at' => $t->created_at?->toIso8601String(),
            'last_replied_at' => $t->last_replied_at?->toIso8601String(),
        ];
    }
}
