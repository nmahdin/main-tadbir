<?php

namespace App\Core\Operations\Incidents;

use App\Core\Operations\Incidents\Contracts\AlertChannelAdapter;
use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Dispatches pending alerts through registered channel adapters.
 *
 * Adapters are iterated in registration order; the default Log
 * adapter is always registered. The dispatcher records each
 * delivery attempt in `ops_alert_deliveries` for audit/retries.
 */
final class AlertDispatcher
{
    /** @var array<string, AlertChannelAdapter> */
    private array $adapters = [];

    public function __construct(private readonly SecurityEventWriter $events)
    {
    }

    public function register(AlertChannelAdapter $adapter): void
    {
        $this->adapters[$adapter->channel()] = $adapter;
    }

    /**
     * Dispatch a single alert to all enabled channels. Returns the
     * number of successful deliveries (0 = all failed / retries later).
     */
    public function dispatch(CoreAlert $alert): int
    {
        $success = 0;
        foreach ($this->adapters as $channel => $adapter) {
            $delivery = $this->ensureDeliveryRecord((int) $alert->id, $channel);
            if ($delivery->delivered_at !== null) {
                $success++;

                continue;
            }
            if ((int) $delivery->attempts >= 5) {
                continue;
            }
            try {
                $ok = $adapter->deliver($alert);
                if ($ok) {
                    DB::table('ops_alert_deliveries')->where('id', $delivery->id)->update([
                        'status' => 'delivered',
                        'delivered_at' => now(),
                        'last_attempt_at' => now(),
                        'attempts' => (int) $delivery->attempts + 1,
                    ]);
                    $success++;
                } else {
                    DB::table('ops_alert_deliveries')->where('id', $delivery->id)->update([
                        'status' => 'failed',
                        'last_error' => 'retryable',
                        'last_attempt_at' => now(),
                        'attempts' => (int) $delivery->attempts + 1,
                    ]);
                }
            } catch (Throwable $e) {
                DB::table('ops_alert_deliveries')->where('id', $delivery->id)->update([
                    'status' => 'failed',
                    'last_error' => mb_substr($e->getMessage(), 0, 500),
                    'last_attempt_at' => now(),
                    'attempts' => (int) $delivery->attempts + 1,
                ]);
            }
        }

        $overallStatus = $success > 0 ? AlertStatus::ACKNOWLEDGED->value : AlertStatus::OPEN->value;
        DB::table('ops_alerts')->where('id', $alert->id)->update([
            'status' => $overallStatus,
            'acknowledged_at' => $success > 0 ? now() : null,
        ]);
        $this->events->record('ops.alert.dispatched', $success > 0 ? SecurityEventOutcome::SUCCESS : SecurityEventOutcome::FAILURE, null, null, null, null, null, null, ['alert_id' => (int) $alert->id, 'channels' => count($this->adapters), 'success' => $success]);

        return $success;
    }

    /**
     * Dispatch all pending alerts. Returns count processed.
     */
    public function dispatchPending(int $limit = 50): int
    {
        /** @var Collection<int, CoreAlert> $alerts */
        $alerts = CoreAlert::query()
            ->where('status', AlertStatus::OPEN->value)
            ->orderBy('first_observed_at')
            ->limit($limit)
            ->get();
        $processed = 0;
        foreach ($alerts as $alert) {
            $this->dispatch($alert);
            $processed++;
        }

        return $processed;
    }

    private function ensureDeliveryRecord(int $alertId, string $channel): object
    {
        $existing = DB::table('ops_alert_deliveries')
            ->where('alert_id', $alertId)
            ->where('channel', $channel)
            ->first();
        if ($existing) {
            return $existing;
        }
        $id = DB::table('ops_alert_deliveries')->insertGetId([
            'alert_id' => $alertId,
            'channel' => $channel,
            'status' => 'pending',
            'attempts' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('ops_alert_deliveries')->where('id', $id)->first();
    }
}
