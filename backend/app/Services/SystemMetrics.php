<?php

namespace App\Services;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Throwable;

/** Lightweight aggregate request metrics without storing paths, users or payloads. */
final class SystemMetrics
{
    private const PREFIX = 'tadbir:system-metrics:';

    public function record(int $statusCode, int $durationMicroseconds, ?Carbon $at = null): void
    {
        $at ??= now();
        $dailyTtl = $at->copy()->addDays(9);
        $minuteTtl = $at->copy()->addMinutes(15);
        $cache = $this->cache();
        $day = self::PREFIX.'day:'.$at->format('Ymd').':';
        $minute = self::PREFIX.'minute:'.$at->format('YmdHi');

        try {
            $this->increment($cache, $day.'requests', 1, $dailyTtl);
            $this->increment($cache, $day.'duration_us', max(0, $durationMicroseconds), $dailyTtl);
            $this->increment($cache, $minute, 1, $minuteTtl);
            if ($statusCode >= 500) {
                $this->increment($cache, $day.'errors', 1, $dailyTtl);
            }
            $cache->add(self::PREFIX.'first_seen_at', $at->toIso8601String(), $at->copy()->addYear());
            $cache->put(self::PREFIX.'last_seen_at', $at->toIso8601String(), $dailyTtl);
        } catch (Throwable) {
            // Observability must never make an application request fail.
        }
    }

    /**
     * @return array{requests_today:int, requests_five_minutes:int, errors_today:int, error_rate:float, average_ms:float, first_seen_at:?string, last_seen_at:?string}
     */
    public function snapshot(?Carbon $at = null): array
    {
        $at ??= now();
        $cache = $this->cache();
        $day = self::PREFIX.'day:'.$at->format('Ymd').':';

        try {
            $requests = (int) $cache->get($day.'requests', 0);
            $errors = (int) $cache->get($day.'errors', 0);
            $duration = (int) $cache->get($day.'duration_us', 0);
            $recent = 0;
            for ($offset = 0; $offset < 5; $offset++) {
                $recent += (int) $cache->get(self::PREFIX.'minute:'.$at->copy()->subMinutes($offset)->format('YmdHi'), 0);
            }

            return [
                'requests_today' => $requests,
                'requests_five_minutes' => $recent,
                'errors_today' => $errors,
                'error_rate' => $requests > 0 ? round(($errors / $requests) * 100, 2) : 0.0,
                'average_ms' => $requests > 0 ? round(($duration / $requests) / 1000, 1) : 0.0,
                'first_seen_at' => $cache->get(self::PREFIX.'first_seen_at'),
                'last_seen_at' => $cache->get(self::PREFIX.'last_seen_at'),
            ];
        } catch (Throwable) {
            return [
                'requests_today' => 0,
                'requests_five_minutes' => 0,
                'errors_today' => 0,
                'error_rate' => 0.0,
                'average_ms' => 0.0,
                'first_seen_at' => null,
                'last_seen_at' => null,
            ];
        }
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('system-status.metrics_store', 'file'));
    }

    private function increment(Repository $cache, string $key, int $amount, Carbon $expiresAt): void
    {
        $cache->add($key, 0, $expiresAt);
        $cache->increment($key, $amount);
    }
}
