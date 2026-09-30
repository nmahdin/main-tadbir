<?php

namespace App\Http\Controllers;

use App\Services\SystemMetrics;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Throwable;

final class SystemStatusController extends Controller
{
    public function __invoke(Request $request, SystemMetrics $metrics): Response
    {
        $databaseConnected = false;
        $databaseLatencyMs = null;
        $databaseStartedAt = hrtime(true);

        try {
            DB::connection()->getPdo();
            DB::select('select 1');
            $databaseConnected = true;
            $databaseLatencyMs = round((hrtime(true) - $databaseStartedAt) / 1_000_000, 1);
        } catch (Throwable) {
            // The public status page reports only availability, never connection details.
        }

        $diskTotal = @disk_total_space(base_path());
        $diskFree = @disk_free_space(base_path());
        $diskUsedPercent = is_float($diskTotal) && $diskTotal > 0 && is_float($diskFree)
            ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1)
            : null;
        $load = function_exists('sys_getloadavg') ? sys_getloadavg() : false;
        $requestMetrics = $metrics->snapshot();
        $healthy = $databaseConnected && ($diskUsedPercent === null || $diskUsedPercent < 90);

        return response()->view('welcome', [
            'healthy' => $healthy,
            'databaseConnected' => $databaseConnected,
            'databaseLatencyMs' => $databaseLatencyMs,
            'metrics' => $requestMetrics,
            'server' => [
                'php_version' => PHP_VERSION,
                'laravel_version' => app()->version(),
                'environment' => app()->environment(),
                'memory_used' => $this->formatBytes(memory_get_usage(true)),
                'memory_peak' => $this->formatBytes(memory_get_peak_usage(true)),
                'memory_limit' => (string) ini_get('memory_limit'),
                'disk_used_percent' => $diskUsedPercent,
                'disk_free' => is_float($diskFree) ? $this->formatBytes($diskFree) : null,
                'load_one_minute' => is_array($load) ? round((float) ($load[0] ?? 0), 2) : null,
                'queue' => (string) config('queue.default'),
                'secure_transport' => $request->isSecure(),
            ],
            'updatedAt' => now(),
        ])->header('Cache-Control', 'no-store, private');
    }

    private function formatBytes(float|int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $value = max(0, (float) $bytes);
        $unit = 0;
        while ($value >= 1024 && $unit < count($units) - 1) {
            $value /= 1024;
            $unit++;
        }

        return number_format($value, $unit === 0 ? 0 : 1).' '.$units[$unit];
    }
}
