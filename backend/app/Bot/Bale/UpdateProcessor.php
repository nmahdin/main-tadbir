<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Routing\MenuRouter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Both inbound transports use the same atomic domain operations and replay protection. */
final class UpdateProcessor
{
    public function __construct(private Settings $settings, private MenuRouter $router, private BaleClient $client) {}

    /** Caller holds RuntimeLock. Webhook delivery order is not an offset/authorization check. */
    public function process(#[\SensitiveParameter] array $update, bool $polling = false): bool
    {
        if (! is_int($update['update_id'] ?? null) || $update['update_id'] < 0 || $update['update_id'] === PHP_INT_MAX) {
            throw new BaleApiException('invalid_updates');
        }
        $id = $update['update_id'];
        $botId = (string) $this->settings->read()['bot_id'];
        $created = DB::transaction(function () use ($update, $id, $botId, $polling): bool {
            $exists = DB::table('bale_inbox')->where('bot_id', $botId)->where('update_id', $id)->exists();
            if (! $exists) {
                $this->router->handle($update);
                DB::table('bale_inbox')->insert(['bot_id' => $botId, 'update_id' => $id, 'status' => 'processed', 'created_at' => now()]);
            }
            $this->settings->write([
                ...($polling ? ['offset' => max((int) ($this->settings->read()['offset'] ?? 0), $id + 1)] : ['last_webhook_at' => now()->toIso8601String()]),
                ...(! $exists ? ['last_received_at' => now()->toIso8601String(), 'last_update_id' => $id, 'last_received_via' => $polling ? 'short_polling' : 'webhook'] : []),
            ]);

            return ! $exists;
        });
        $callbackId = $update['callback_query']['id'] ?? null;
        if (is_string($callbackId) && strlen($callbackId) <= 256) {
            try {
                $this->client->call($this->settings->token(), 'answerCallbackQuery', ['callback_query_id' => $callbackId]);
            } catch (BaleApiException) {
                // An acknowledgement failure cannot undo a committed task or form.
            }
        }

        return $created;
    }

    /** Opportunistic, bounded retention; no cron needed, and replay IDs are never removed. */
    public function cleanup(float $deadline): void
    {
        $queries = [
            DB::table('bale_link_codes')->where('expires_at', '<=', now()),
            DB::table('bale_conversations')->where('expires_at', '<=', now()),
            DB::table('bale_outbox')->whereIn('status', ['sent', 'failed', 'unknown', 'cancelled'])->where('updated_at', '<', now()->subDays(30)),
            ...(Schema::hasTable('bale_panel_sessions') ? [DB::table('bale_panel_sessions')->where('expires_at', '<=', now())] : []),
        ];
        foreach ($queries as $query) {
            if (microtime(true) >= $deadline) {
                return;
            }
            $ids = (clone $query)->orderBy('id')->limit(100)->pluck('id')->all();
            if ($ids) {
                $query->whereIn('id', $ids)->delete();
            }
        }
    }
}
