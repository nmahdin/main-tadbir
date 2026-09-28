<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Support\RuntimeLock;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BaleTransportController extends Controller
{
    public function webhook(): JsonResponse
    {
        // Bale currently documents no signature/secret-header verification contract.
        // Never authenticate an incoming user by trusting JSON on a public route.
        return response()->json(['message' => 'دریافت Webhook تا تأیید روش احراز اصالت غیرفعال است.'], 503);
    }

    public function tick(Request $request, RuntimeLock $lock, PollingRunner $runner): JsonResponse
    {
        $secret = (string) config('bale.runner_secret');
        abort_unless(strlen($secret) >= 32 && hash_equals($secret, (string) $request->bearerToken()), 403);
        // This endpoint NEVER accepts incoming updates, destination IDs or methods from the caller.
        try {
            return response()->json(['data' => $lock->run(fn () => $runner->tick(true))])->header('Cache-Control', 'no-store');
        } catch (BaleApiException $e) {
            return response()->json(['error_code' => $e->reason], 503);
        }
    }
}
