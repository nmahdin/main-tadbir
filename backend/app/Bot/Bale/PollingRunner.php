<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;

final class PollingRunner
{
    public function __construct(private Settings $settings, private BaleClient $client, private UpdateProcessor $processor, private Outbox $outbox) {}

    /** A bounded HTTP tick, not a daemon. Caller must hold RuntimeLock. */
    public function tick(bool $external = false): array
    {
        abort_unless($this->settings->ready(), 422, 'ابتدا ربات را ذخیره، آزمایش و فعال کنید.');
        $deadline = microtime(true) + config('bale.tick_seconds');
        $s = $this->settings->read();
        $received = 0;
        try {
            if (($s['transport'] ?? '') === 'webhook' || ($s['remote_webhook_present'] ?? false)) {
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
                if ($this->processor->process($update, true)) {
                    $received++;
                }
            }
            $sent = $this->outbox->flush($deadline);
            $this->settings->write([
                'last_tick_at' => now()->toIso8601String(), 'last_error' => null,
                ...($external ? ['last_external_tick_at' => now()->toIso8601String()] : []),
            ]);
            $this->processor->cleanup($deadline);

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
