<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class BaleSettingsController extends Controller
{
    public function __construct(private Settings $settings, private RuntimeLock $lock, private BaleClient $client) {}

    public function show(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->settings->publicState()])->header('Cache-Control', 'no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'token' => ['sometimes', 'nullable', 'string', 'max:200', 'regex:/^[0-9]+:[A-Za-z0-9_-]{20,180}$/'],
        ]);
        $this->lock->run(fn () => $this->settings->save($request->user(), $data));

        return $this->show($request);
    }

    public function test(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return $this->remote($request, fn () => $this->settings->test($this->client));
    }

    public function polling(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['confirm' => ['required', 'accepted']]);

        return $this->remote($request, function () use ($request): void {
            $this->client->call($this->settings->token(), 'deleteWebhook');
            $this->settings->write(['remote_webhook_present' => false]);
            $this->settings->audit($request->user(), 'bale_polling_enabled');
        });
    }

    public function disconnect(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['confirm' => ['required', 'accepted'], 'local_only' => ['sometimes', 'boolean']]);

        return $this->remote($request, fn () => $this->settings->disconnect($request->user(), $this->client, $request->boolean('local_only')));
    }

    public function tick(Request $request, PollingRunner $runner): JsonResponse
    {
        $this->authorizeAdmin($request);

        return $this->remote($request, fn () => $runner->tick());
    }

    private function remote(Request $request, \Closure $action): JsonResponse
    {
        try {
            $result = $this->lock->run($action);

            return response()->json(['data' => $this->settings->publicState(), 'result' => $result])->header('Cache-Control', 'no-store');
        } catch (BaleApiException $e) {
            return response()->json(['message' => $e->getMessage(), 'error_code' => $e->reason, 'data' => $this->settings->publicState()], 422)->header('Cache-Control', 'no-store');
        }
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isActive() && $request->user()->hasPermission('settings.manage'), 403);
    }
}
