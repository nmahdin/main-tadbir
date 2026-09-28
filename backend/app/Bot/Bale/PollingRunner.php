<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Routing\MenuRouter;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use Illuminate\Support\Facades\DB;

final class PollingRunner
{
    public function __construct(private Settings $settings, private BaleClient $client, private MenuRouter $router, private Outbox $outbox) {}

    /** A bounded HTTP tick, not a daemon. Caller must hold RuntimeLock. */
    public function tick(bool $external = false): array
    {
        abort_unless($this->settings->ready(), 422, 'ابتدا ربات را ذخیره، آزمایش و فعال کنید.');
        $deadline = microtime(true) + config('bale.tick_seconds');
        $s = $this->settings->read();
        $botId = (string) $s['bot_id'];
        $received = 0;
        try {
            if ($s['remote_webhook_present'] ?? false) {
                throw new BaleApiException('webhook_conflict');
            }
            $updates = $this->client->call($this->settings->token(), 'getUpdates', [
                'offset' => (int) ($s['offset'] ?? 0), 'limit' => 5, 'timeout' => 0,
            ]);
            if (! is_array($updates) || ! array_is_list($updates)) {
                throw new BaleApiException('invalid_updates');
            }
            usort($updates, fn ($a, $b) => ($a['update_id'] ?? -1) <=> ($b['update_id'] ?? -1));
            foreach ($updates as $update) {
                if (microtime(true) + config('bale.request_timeout') >= $deadline) {
                    break;
                }
                if (! is_array($update) || ! is_int($update['update_id'] ?? null) || $update['update_id'] < 0) {
                    throw new BaleApiException('invalid_updates');
                }
                $id = $update['update_id'];
                if ($id < (int) ($s['offset'] ?? 0)) {
                    continue;
                }
                DB::transaction(function () use ($update, $botId, $id, &$received): void {
                    if (! DB::table('bale_inbox')->where('bot_id', $botId)->where('update_id', $id)->exists()) {
                        $this->router->handle($update);
                        DB::table('bale_inbox')->insert(['bot_id' => $botId, 'update_id' => $id, 'status' => 'processed', 'created_at' => now()]);
                        $received++;
                    }
                    $this->settings->write(['offset' => $id + 1, 'last_received_at' => now()->toIso8601String()]);
                });
                $callbackId = $update['callback_query']['id'] ?? null;
                if (is_string($callbackId) && strlen($callbackId) <= 256) {
                    try {
                        $this->client->call($this->settings->token(), 'answerCallbackQuery', ['callback_query_id' => $callbackId]);
                    } catch (BaleApiException) {
                        // UI acknowledgement must not roll back a committed business operation.
                    }
                }
            }
            $sent = $this->outbox->flush($deadline);
            $this->settings->write([
                'last_tick_at' => now()->toIso8601String(), 'last_error' => null,
                ...($external ? ['last_external_tick_at' => now()->toIso8601String()] : []),
            ]);
            DB::table('bale_link_codes')->where('expires_at', '<=', now())->delete();
            BaleConversation::where('expires_at', '<=', now())->delete();

            BaleOutbox::whereIn('status', ['sent', 'failed', 'unknown', 'cancelled'])->where('updated_at', '<', now()->subDays(30))->delete();

            // Inbox contains only identifiers; retain these so old updates cannot be replayed.
            return ['received' => $received, 'sent' => $sent];
        } catch (BaleApiException $e) {
            $this->settings->write(['last_error' => $e->reason]);
            throw $e;
        } catch (\Throwable) {
            // Do not let a raw incoming code / encrypted draft appear in exception traces.
            $this->settings->write(['last_error' => 'processing_failed']);
            throw new BaleApiException('processing_failed');
        }
    }
}
