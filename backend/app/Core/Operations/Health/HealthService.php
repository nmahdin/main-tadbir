<?php

namespace App\Core\Operations\Health;

use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Lightweight operational health probes (C7-D). Public (unauthenticated)
 * liveness is a fixed 200 OK; readiness and the detailed diagnostic
 * report are permission-gated and return only summaries, never raw
 * exception messages, connection strings, or environment values.
 */
final class HealthService
{
    public function __construct(
        private readonly FilesystemFactory $filesystems,
    ) {}

    /**
     * Liveness: the process is running. No I/O.
     *
     * @return array{status:string}
     */
    public function liveness(): array
    {
        return ['status' => 'ok'];
    }

    /**
     * Readiness: bound I/O checks (all <1s budget). Returns overall ok
     * or degraded with failing component names; no sensitive detail.
     *
     * @return array{status:string,checks:array<string,array{status:string}>}
     */
    public function readiness(): array
    {
        $checks = [];
        $overall = 'ok';

        $checks['database'] = $this->probeDb();
        if ($checks['database']['status'] !== 'ok') {
            $overall = 'degraded';
        }
        $checks['cache'] = $this->probeCache();
        if ($checks['cache']['status'] !== 'ok') {
            $overall = 'degraded';
        }
        $checks['storage'] = $this->probeStorage();
        if ($checks['storage']['status'] !== 'ok') {
            $overall = 'degraded';
        }

        return ['status' => $overall, 'checks' => $checks];
    }

    /**
     * Detailed operational report (platform.health.view). Adds queue
     * backlog, failed-job counts, backup freshness, maintenance state.
     *
     * @return array<string, mixed>
     */
    public function details(): array
    {
        $readiness = $this->readiness();
        $details = $readiness;
        try {
            $details['queue'] = [
                'status' => 'ok',
                'pending_jobs' => (int) DB::table('jobs')->count(),
                'failed_jobs' => (int) DB::table('failed_jobs')->count(),
            ];
        } catch (Throwable) {
            $details['queue'] = ['status' => 'degraded'];
        }
        try {
            $latest = DB::table('ops_backup_jobs')
                ->where('status', 'succeeded')
                ->orderByDesc('finished_at')->first();
            $freshnessHours = $latest?->finished_at
                ? now()->diffInHours($latest->finished_at, false)
                : null;
            $details['backups'] = [
                'status' => $latest && $freshnessHours !== null && $freshnessHours < 26 ? 'ok' : 'degraded',
                'last_succeeded_at' => $latest?->finished_at,
                'hours_since' => $freshnessHours,
            ];
        } catch (Throwable) {
            $details['backups'] = ['status' => 'unknown'];
        }
        try {
            $active = DB::table('ops_maintenance_windows')
                ->where('status', 'active')->first();
            $next = DB::table('ops_maintenance_windows')
                ->where('status', 'scheduled')
                ->where('scheduled_start', '>', now())
                ->orderBy('scheduled_start')->first();
            $details['maintenance'] = [
                'active' => $active !== null,
                'next_scheduled_start' => $next?->scheduled_start,
            ];
        } catch (Throwable) {
            $details['maintenance'] = ['active' => false];
        }
        try {
            $openIncidents = DB::table('ops_incidents')
                ->whereIn('status', ['open', 'acknowledged', 'investigating', 'mitigated'])
                ->count();
            $details['incidents'] = ['open_count' => $openIncidents];
        } catch (Throwable) {
            $details['incidents'] = ['open_count' => null];
        }

        return $details;
    }

    /**
     * @return array{status:string}
     */
    private function probeDb(): array
    {
        try {
            DB::connection()->select('SELECT 1');

            return ['status' => 'ok'];
        } catch (Throwable) {
            return ['status' => 'degraded'];
        }
    }

    /**
     * @return array{status:string}
     */
    private function probeCache(): array
    {
        try {
            $key = 'health:probe:' . bin2hex(random_bytes(4));
            Cache::put($key, 1, 5);
            $val = Cache::get($key);
            Cache::forget($key);

            return ['status' => $val === 1 ? 'ok' : 'degraded'];
        } catch (Throwable) {
            return ['status' => 'degraded'];
        }
    }

    /**
     * @return array{status:string}
     */
    private function probeStorage(): array
    {
        try {
            $disk = $this->filesystems->disk('local');
            $disk->put('.health-probe', 'ok');
            $contents = $disk->get('.health-probe');
            $disk->delete('.health-probe');

            return ['status' => $contents === 'ok' ? 'ok' : 'degraded'];
        } catch (Throwable) {
            return ['status' => 'degraded'];
        }
    }
}
