<?php

namespace App\Bot\Bale\Support;

use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Encrypted recovery point for a pending Bale conversation.
 *
 * A prompt and its flow checkpoint are committed in the same database
 * transaction. The last interactive outbox item (including a terminal
 * home/success reply without a checkpoint) is authoritative: an older form
 * must NEVER be resurrected after explicit cancellation or completion.
 *
 * No user text or decrypted draft is logged or sent to Bale as metadata.
 */
final class ConversationCheckpoint
{
    private const KEY = '_flow_checkpoint';

    public function capture(string $key, string $botId, ?BaleUserLink $link, array $payload): array
    {
        if (! $link || ! $this->interactiveKey($key, $botId)) {
            return $payload;
        }

        $session = BaleConversation::where('link_id', $link->id)->first();
        if (! $session || ! MenuNavigation::active($session) || ! $session->expires_at?->isFuture()) {
            return $payload;
        }

        return [...$payload, self::KEY => [
            'step' => $session->step,
            'nonce' => $session->nonce,
            'data' => $session->data,
            'expires_at' => $session->expires_at->toIso8601String(),
        ]];
    }

    public function recover(BaleUserLink $link, string $chat, string $botId): ?BaleConversation
    {
        // Limit both age and scan count. The last genuine interactive reply
        // is decisive even when it has NO checkpoint (home/cancel/success).
        $recent = BaleOutbox::query()
            ->where('bot_id', $botId)
            ->where('link_id', $link->id)
            ->where('chat_id', $chat)
            ->where('created_at', '>=', now()->subHours(2))
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        $last = $recent->first(fn (BaleOutbox $item) => $this->interactiveKey((string) $item->deduplication_key, $botId));
        if (! $last) {
            return null;
        }

        $checkpoint = $last->payload[self::KEY] ?? null;
        if (! is_array($checkpoint) || ! is_array($checkpoint['data'] ?? null)
            || ! is_string($checkpoint['nonce'] ?? null)
            || ! preg_match('/^[a-f0-9]{24}$/D', $checkpoint['nonce'])
            || ! is_string($checkpoint['step'] ?? null)
            || ! in_array($checkpoint['step'], [...MenuNavigation::DRAFTING, 'asset_context'], true)
            || ! is_string($checkpoint['expires_at'] ?? null)) {
            return null;
        }

        try {
            $expires = Carbon::parse($checkpoint['expires_at']);
        } catch (\Throwable) {
            return null;
        }
        if ($expires->lte(now())) {
            return null;
        }

        // The outbox payload is already encrypted at rest. Restore into the
        // original encrypted conversation column; never echo the data.
        $data = $checkpoint['data'];
        if (is_array($last->payload['_automation'] ?? null)) {
            $data['_automation'] = $last->payload['_automation'];
        }

        $session = BaleConversation::updateOrCreate(['link_id' => $link->id], [
            'step' => $checkpoint['step'],
            'nonce' => $checkpoint['nonce'],
            'data' => $data,
            'expires_at' => $expires,
        ]);

        Log::warning('bale_conversation_restored_from_checkpoint', [
            'step' => $checkpoint['step'],
            'reference' => substr(hash('sha256', $botId.':'.$link->id), 0, 12),
        ]);

        return $session;
    }

    private function interactiveKey(string $key, string $botId): bool
    {
        return (bool) preg_match('/^'.preg_quote($botId, '/').':[0-9]+$/D', $key);
    }
}
