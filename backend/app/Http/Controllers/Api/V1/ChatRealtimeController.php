<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Access\ChatAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Presence/typing state with a transport-neutral payload.
 * HTTP polling is the fallback; a WebSocket gateway can publish and consume the
 * same conversation/user/type fields without changing authorization semantics.
 */
final class ChatRealtimeController extends Controller
{
    public function heartbeat(Request $request, int $conversation)
    {
        $record = app(ChatAccess::class)->conversation($request->user(), $conversation);
        $data = $request->validate(['typing' => ['sometimes', 'boolean']]);
        $userId = (int) $request->user()->id;
        Cache::put($this->presenceKey($userId), true, now()->addSeconds(65));
        if (($data['typing'] ?? false) === true) {
            Cache::put($this->typingKey($conversation, $userId), true, now()->addSeconds(7));
        } else {
            Cache::forget($this->typingKey($conversation, $userId));
        }

        return $this->payload($record->payload['memberIds'] ?? [], $conversation, $userId);
    }

    public function status(Request $request, int $conversation)
    {
        $record = app(ChatAccess::class)->conversation($request->user(), $conversation);
        Cache::put($this->presenceKey((int) $request->user()->id), true, now()->addSeconds(65));

        return $this->payload($record->payload['memberIds'] ?? [], $conversation, (int) $request->user()->id);
    }

    /** @param array<int, int|string> $memberIds */
    private function payload(array $memberIds, int $conversation, int $viewerId)
    {
        $ids = collect($memberIds)->filter(fn ($id) => is_numeric($id))->map(fn ($id) => (int) $id)->unique()->values();
        $users = User::query()->whereIn('id', $ids)->get(['id', 'name'])->keyBy('id');
        $online = $ids->filter(fn (int $id) => Cache::has($this->presenceKey($id)))
            ->map(fn (int $id) => ['id' => (string) $id, 'name' => $users->get($id)?->name])->values();
        $typing = $ids->filter(fn (int $id) => $id !== $viewerId && Cache::has($this->typingKey($conversation, $id)))
            ->map(fn (int $id) => ['id' => (string) $id, 'name' => $users->get($id)?->name])->values();

        return response()->json(['data' => [
            'conversationId' => (string) $conversation,
            'onlineUsers' => $online,
            'typingUsers' => $typing,
            'transport' => 'polling-fallback',
            'serverTime' => now()->toIso8601String(),
        ]]);
    }

    private function presenceKey(int $userId): string
    {
        return 'chat:presence:user:'.$userId;
    }

    private function typingKey(int $conversation, int $userId): string
    {
        return 'chat:typing:conversation:'.$conversation.':user:'.$userId;
    }
}
