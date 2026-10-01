<?php

namespace App\Http\Controllers\Api\V1\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Bot\Bale\WebhookTransport;
use App\Http\Controllers\Controller;
use App\Models\BaleOutbox;
use App\Models\DamDataTable;
use App\Services\Access\UserPermissionGate;
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
        $tables = ! Schema::hasTable('dam_data_table_department') ? collect() : DamDataTable::with(['departments' => fn ($query) => $query->where('departments.status', 'active')])
            ->whereHas('departments')->orderBy('name')->get(['id', 'name'])->map(fn ($table) => [
                'id' => $table->id, 'name' => $table->name,
                'departments' => $table->departments->map(fn ($department) => ['id' => $department->id, 'name' => $department->name])->all(),
            ]);

        $configuration = $automations->read();

        return response()->json(['data' => [
            ...$configuration,
            'tables' => $tables,
            'executions' => $this->automationDeliveries($configuration['rules'] ?? []),
        ]])->header('Cache-Control', 'no-store');
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

    public function disconnect(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['confirm' => ['required', 'accepted'], 'local_only' => ['sometimes', 'boolean']]);

        return $this->remote($request, fn () => $this->settings->disconnect($request->user(), $this->client, $request->boolean('local_only')));
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

    /** Latest outbound state per automation, without exposing encrypted payloads or destination identifiers. */
    private function automationDeliveries(array $rules): array
    {
        $allowed = array_fill_keys(array_column($rules, 'id'), true);
        $result = [];
        if ($allowed === []) {
            return $result;
        }

        foreach (BaleOutbox::query()->orderByDesc('id')->limit(200)->get() as $message) {
            $id = $message->payload['_automation']['id'] ?? null;
            if (! is_string($id) || ! isset($allowed[$id]) || isset($result[$id])) {
                continue;
            }
            $result[$id] = [
                'status' => $message->status,
                'error_code' => $message->error_code,
                'updated_at' => $message->updated_at?->toIso8601String(),
            ];
        }

        return $result;
    }

    private function authorizeAdmin(Request $request): void
    {
        app(UserPermissionGate::class)->authorizeAny($request->user(), 'settings.manage');
    }
}
