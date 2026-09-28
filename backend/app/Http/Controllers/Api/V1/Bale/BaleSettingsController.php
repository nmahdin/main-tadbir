<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Bot\Bale\WebhookTransport;
use App\Http\Controllers\Controller;
use App\Models\DamDataTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

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

    public function automations(Request $request, Automations $automations): JsonResponse
    {
        $this->authorizeAdmin($request);
        if ($request->isMethod('put')) {
            $this->lock->run(fn () => $automations->save($request->user(), $request->all()));
        }
        $tables = ! Schema::hasTable('dam_data_table_team') ? collect() : DamDataTable::with(['teams' => fn ($query) => $query->where('teams.status', 'active')])
            ->whereHas('teams')->orderBy('name')->get(['id', 'name'])->map(fn ($table) => [
                'id' => $table->id, 'name' => $table->name,
                'teams' => $table->teams->map(fn ($team) => ['id' => $team->id, 'name' => $team->name])->all(),
            ]);

        return response()->json(['data' => [...$automations->read(), 'tables' => $tables]])->header('Cache-Control', 'no-store');
    }

    public function test(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return $this->remote($request, fn () => $this->settings->test($this->client));
    }

    public function webhook(Request $request, WebhookTransport $webhook): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['confirm' => ['required', 'accepted'], 'acknowledge_secret_url' => ['required', 'accepted'], 'rotate' => ['sometimes', 'boolean']]);

        return $this->remote($request, fn () => $webhook->activate($request->user(), $request->boolean('rotate')));
    }

    public function polling(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['confirm' => ['required', 'accepted']]);

        return $this->remote($request, function () use ($request): void {
            if ($this->client->call($this->settings->token(), 'deleteWebhook') !== true) {
                throw new BaleApiException('invalid_response');
            }
            $this->settings->write(['transport' => 'short_polling', 'webhook_secret' => null, 'webhook_status' => 'not_configured', 'remote_webhook_present' => false, 'remote_webhook_matches' => false, 'last_error' => null]);
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
