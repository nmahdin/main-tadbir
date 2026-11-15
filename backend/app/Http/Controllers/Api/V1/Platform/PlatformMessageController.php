<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Messaging\CoreSystemMessage;
use App\Core\Messaging\CoreSystemMessageDelivery;
use App\Core\Messaging\SystemMessageAudience;
use App\Core\Messaging\SystemMessageService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Platform-admin CRUD for official system messages (SYS-MSG).
 * Requires platform.messages.manage.
 */
final class PlatformMessageController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly SystemMessageService $service) {}

    public function index(Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($request): JsonResponse {
            $this->platformActor($request, 'platform.messages.manage');
            $perPage = $this->perPage($request);
            $q = CoreSystemMessage::query()->orderByDesc('created_at');
            if ($status = $request->string('status')->toString()) {
                $q->where('status', $status);
            }
            $page = $q->paginate($perPage);

            return response()->json([
                'data' => collect($page->items())->map(fn (CoreSystemMessage $m): array => [
                    'id' => $m->id,
                    'slug' => $m->slug,
                    'version' => $m->version,
                    'audience' => $m->audience,
                    'title' => $m->title,
                    'category' => $m->category,
                    'ack_required' => (bool) $m->ack_required,
                    'status' => $m->status,
                    'published_at' => $m->published_at?->toIso8601String(),
                    'created_at' => $m->created_at?->toIso8601String(),
                ])->all(),
                'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
            ]);
        });
    }

    public function store(Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($request): JsonResponse {
            $actor = $this->platformActor($request, 'platform.messages.manage');
            $validated = $request->validate([
                'slug' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9\-\.]+$/'],
                'title' => ['required', 'string', 'max:200'],
                'body_markdown' => ['required', 'string', 'max:50000'],
                'audience' => ['required', Rule::enum(SystemMessageAudience::class)],
                'organization_id' => ['required_if:audience,organization', 'integer', 'nullable'],
                'ack_required' => ['sometimes', 'boolean'],
                'ack_policy_version' => ['nullable', 'string', 'max:64'],
                'cta_label' => ['sometimes', 'string', 'max:120'],
                'cta_link' => ['nullable', 'string', 'max:1000'],
                'category' => ['nullable', 'string', 'max:60'],
                'publish' => ['sometimes', 'boolean'],
                'bump_version' => ['sometimes', 'boolean'],
            ]);

            $organization = null;
            if (($validated['audience'] ?? null) === SystemMessageAudience::Organization->value) {
                $organization = \App\Core\Organizations\Organization::query()->findOrFail((int) $validated['organization_id']);
            }

            $msg = $this->service->draft($actor, $validated['slug'], $validated, $organization);
            if ($validated['publish'] ?? false) {
                $msg = $this->service->publish($actor, $msg);
            }
            return response()->json(['data' => ['id' => $msg->id, 'slug' => $msg->slug, 'version' => $msg->version, 'status' => $msg->status]], 201);
        });
    }

    public function publish(CoreSystemMessage $systemMessage, Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($systemMessage, $request): JsonResponse {
            $actor = $this->platformActor($request, 'platform.messages.manage');
            $msg = $this->service->publish($actor, $systemMessage);
            return response()->json(['data' => ['id' => $msg->id, 'status' => $msg->status]]);
        });
    }

    public function retire(CoreSystemMessage $systemMessage, Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($systemMessage, $request): JsonResponse {
            $actor = $this->platformActor($request, 'platform.messages.manage');
            $msg = $this->service->retire($actor, $systemMessage);
            return response()->json(['data' => ['id' => $msg->id, 'status' => $msg->status]]);
        });
    }

    public function deliveries(CoreSystemMessage $systemMessage, Request $request): JsonResponse
    {
        return $this->platformRespond(function () use ($systemMessage, $request): JsonResponse {
            $this->platformActor($request, 'platform.messages.manage');
            $perPage = $this->perPage($request);
            $page = CoreSystemMessageDelivery::query()
                ->where('message_id', $systemMessage->id)
                ->orderByDesc('created_at')
                ->paginate($perPage);
            return response()->json([
                'data' => collect($page->items())->map(fn (CoreSystemMessageDelivery $d): array => [
                    'id' => $d->id,
                    'user_id' => $d->user_id,
                    'read_at' => $d->read_at?->toIso8601String(),
                    'acknowledged_at' => $d->acknowledged_at?->toIso8601String(),
                    'first_delivered_at' => $d->first_delivered_at?->toIso8601String(),
                ])->all(),
                'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
            ]);
        });
    }
}
