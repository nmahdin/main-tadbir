<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * بررسی سلامت سامانه بدون نیاز به احراز هویت.
 *
 * - GET /api/v1/health     : اتصال API و بالا بودن بک‌اند
 * - GET /api/v1/health/db  : اتصال بک‌اند به دیتابیس
 */
class HealthController extends Controller
{
    public function api(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'service' => 'tadbir-api',
            'version' => 'v1',
            'time' => now()->toIso8601String(),
        ]);
    }

    public function db(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            $database = DB::connection()->getDatabaseName();

            return response()->json([
                'ok' => true,
                'service' => 'tadbir-api',
                'database' => $database,
                'time' => now()->toIso8601String(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'service' => 'tadbir-api',
                'error' => 'اتصال به دیتابیس برقرار نشد.',
            ], 503);
        }
    }
}
