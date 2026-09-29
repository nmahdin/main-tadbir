<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Bot\Bale\WebhookTransport;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

final class BaleTransportController extends Controller
{
    public function webhook(): JsonResponse
    {
        // Keep the historical public URL closed. Only the independently secret route ingests updates.
        return response()->json(['message' => 'برای دریافت خودکار، Webhook را از تنظیمات ربات فعال کنید؛ آدرس پایه ورودی عمومی نیست.'], 503);
    }

    public function receive(Request $request, #[\SensitiveParameter] string $secret, WebhookTransport $webhook, Settings $settings): JsonResponse
    {
        try {
            if (! $webhook->accepts($secret)) {
                return response()->json(['ok' => false], 404);
            }
            if ((int) $request->header('Content-Length', 0) > 65536 || strlen($request->getContent()) > 65536) {
                return response()->json(['ok' => false], 413);
            }
            if (! $request->isJson()) {
                return response()->json(['ok' => false], 415);
            }
            try {
                $update = json_decode($request->getContent(), true, 32, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return response()->json(['ok' => false], 400);
            }
            if (! is_array($update) || ! is_int($update['update_id'] ?? null) || $update['update_id'] < 0 || $update['update_id'] === PHP_INT_MAX) {
                return response()->json(['ok' => false], 400);
            }
            $kinds = array_intersect(['message', 'edited_message', 'callback_query', 'pre_checkout_query'], array_keys($update));
            if (count($kinds) !== 1 || ! is_array($update[reset($kinds)])) {
                return response()->json(['ok' => false], 400);
            }
            $lock = Cache::lock('bale:runtime', 90);
            if (! $lock->get()) {
                return response()->json(['ok' => false], 503)->header('Retry-After', '2');
            }
            try {
                if (! $webhook->accepts($secret)) {
                    return response()->json(['ok' => false], 404);
                }
                $webhook->receive($update);
            } catch (\Throwable) {
                // Mutate integration state only while holding the shared runtime lock.
                try {
                    $settings->write(['last_error' => 'webhook_processing_failed']);
                } catch (\Throwable) {
                }
                throw new BaleApiException('webhook_processing_failed');
            } finally {
                $lock->release();
            }

            return response()->json(['ok' => true])->header('Cache-Control', 'no-store');
        } catch (\Throwable) {
            // Never report a raw exception/request: it may contain the URL credential or linking code.
            return response()->json(['ok' => false, 'error_code' => 'webhook_processing_failed'], 503)->header('Cache-Control', 'no-store');
        }
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
