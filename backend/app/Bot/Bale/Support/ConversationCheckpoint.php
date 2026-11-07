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
        if (! $session || ! MenuNavigation::active($session)) {
            return $payload;
        }
        // Some hosting configurations shift the persisted expiration while
        // updated_at remains fresh. A new prompt must always carry a fresh
        // checkpoint, otherwise recovery will replay the FIRST field forever.
        if (! $session->expires_at?->isFuture()) {
            if (! $session->updated_at?->gt(now()->subMinutes(15))) {
                return $payload;
            }
            $session->update(['expires_at' => MenuNavigation::lifetime()]);
        }

        FlowDiagnostics::trace('checkpoint_saved', $link, [
            'step' => $session->step,
            'field_index' => is_numeric($session->data['index'] ?? null) ? (int) $session->data['index'] : null,
        ]);

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

        // Interactive replies without a checkpoint are not necessarily the
        // end of a form: the conversation row may have disappeared before the
        // bot created a generic fallback reply. Skip such gaps, but NEVER
        // cross an explicit end marker (cancel/home/success).
        $checkpoint = null;
        $last = null;
        foreach ($recent as $candidate) {
            if (! $this->interactiveKey((string) $candidate->deduplication_key, $botId)) {
                continue;
            }
            if (($candidate->payload['_flow_end'] ?? false) === true) {
                FlowDiagnostics::trace('checkpoint_recovery', $link, ['decision' => 'blocked']);

                return null;
            }
            if (array_key_exists(self::KEY, $candidate->payload)) {
                $last = $candidate;
                $checkpoint = $candidate->payload[self::KEY];
                break;
            }
        }
        if (! $last) {
            FlowDiagnostics::trace('checkpoint_recovery', $link, ['decision' => 'not_found']);

            return null;
        }
        if (! is_array($checkpoint) || ! is_array($checkpoint['data'] ?? null)
            || ! is_string($checkpoint['nonce'] ?? null)
            || ! preg_match('/^[a-f0-9]{24}$/D', $checkpoint['nonce'])
            || ! is_string($checkpoint['step'] ?? null)
            || ! in_array($checkpoint['step'], [...MenuNavigation::DRAFTING, 'asset_context'], true)
            || ! is_string($checkpoint['expires_at'] ?? null)) {
            FlowDiagnostics::trace('checkpoint_recovery', $link, [
                'decision' => $checkpoint === null ? 'no_checkpoint' : 'invalid_checkpoint',
                'checkpoint_present' => $checkpoint !== null,
            ]);

            return null;
        }

        try {
            $expires = Carbon::parse($checkpoint['expires_at']);
        } catch (\Throwable) {
            FlowDiagnostics::trace('checkpoint_recovery', $link, [
                'decision' => 'invalid_checkpoint',
                'checkpoint_present' => true,
            ]);

            return null;
        }
        if ($expires->lte(now())) {
            FlowDiagnostics::trace('checkpoint_recovery', $link, [
                'decision' => 'expired',
                'step' => $checkpoint['step'],
                'checkpoint_present' => true,
            ]);

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

        FlowDiagnostics::trace('checkpoint_recovery', $link, [
            'decision' => 'restored',
            'step' => $checkpoint['step'],
            'checkpoint_present' => true,
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
