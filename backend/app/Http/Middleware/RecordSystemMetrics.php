<?php

namespace App\Http\Middleware;

use App\Services\SystemMetrics;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RecordSystemMetrics
{
    private const START_ATTRIBUTE = '_tadbir_metrics_started_at';

    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set(self::START_ATTRIBUTE, hrtime(true));

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $startedAt = $request->attributes->get(self::START_ATTRIBUTE);
        if (! is_int($startedAt)) {
            return;
        }

        $durationMicroseconds = (int) max(0, round((hrtime(true) - $startedAt) / 1000));
        app(SystemMetrics::class)->record($response->getStatusCode(), $durationMicroseconds);
    }
}
