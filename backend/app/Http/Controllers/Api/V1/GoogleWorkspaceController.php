<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Services\DamAssetAccess;
use App\Services\DamTableAccess;
use App\Services\GoogleWorkspaceService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

final class GoogleWorkspaceController extends Controller
{
    public function __construct(private readonly GoogleWorkspaceService $workspace) {}

    public function status(Request $request)
    {
        abort_unless($request->user()?->isActive(), 403);

        return response()->json(['data' => $this->workspace->settingsStatus()]);
    }

    public function assetStatus(Request $request, DamAsset $asset)
    {
        $this->viewAsset($request, $asset);

        return response()->json(['data' => ['link' => $this->workspace->assetLink($asset)]]);
    }

    public function pushAsset(Request $request, DamAsset $asset)
    {
        $this->editAsset($request, $asset);
        $data = $request->validate(['force' => 'sometimes|boolean']);
        $link = $this->provider(fn () => $this->workspace->pushAsset($asset, $request->user(), (bool) ($data['force'] ?? false)));

        return response()->json(['data' => ['link' => $link]]);
    }

    public function pullAsset(Request $request, DamAsset $asset)
    {
        $this->editAsset($request, $asset);
        $data = $request->validate(['force' => 'sometimes|boolean']);
        $result = $this->provider(fn () => $this->workspace->pullAsset($asset, $request->user(), (bool) ($data['force'] ?? false)));

        return response()->json(['data' => $result]);
    }

    public function disconnectAsset(Request $request, DamAsset $asset)
    {
        $this->editAsset($request, $asset);
        $this->workspace->disconnectAsset($asset, $request->user());

        return response()->noContent();
    }

    public function tableStatus(Request $request, DamDataTable $dataTable)
    {
        $this->viewTable($request, $dataTable);

        return response()->json(['data' => ['link' => $this->workspace->tableLink($dataTable)]]);
    }

    public function pushTable(Request $request, DamDataTable $dataTable)
    {
        $this->editTable($request, $dataTable);
        $data = $request->validate(['force' => 'sometimes|boolean']);
        $link = $this->provider(fn () => $this->workspace->pushTable($dataTable, $request->user(), (bool) ($data['force'] ?? false)));

        return response()->json(['data' => ['link' => $link]]);
    }

    public function pullTable(Request $request, DamDataTable $dataTable)
    {
        $this->editTable($request, $dataTable);
        $data = $request->validate(['force' => 'sometimes|boolean']);
        $result = $this->provider(fn () => $this->workspace->pullTable($dataTable, $request->user(), (bool) ($data['force'] ?? false)));

        return response()->json(['data' => $result]);
    }

    public function disconnectTable(Request $request, DamDataTable $dataTable)
    {
        $this->editTable($request, $dataTable);
        $this->workspace->disconnectTable($dataTable, $request->user());

        return response()->noContent();
    }

    private function viewAsset(Request $request, DamAsset $asset): void
    {
        abort_unless(app(DamAssetAccess::class)->canView($request->user(), $asset), 403);
    }

    private function editAsset(Request $request, DamAsset $asset): void
    {
        $this->viewAsset($request, $asset);
        abort_unless($request->user()->hasPermission('assets.edit_info'), 403);
    }

    private function viewTable(Request $request, DamDataTable $table): void
    {
        abort_unless(app(DamTableAccess::class)->canView($request->user(), $table), 403);
    }

    private function editTable(Request $request, DamDataTable $table): void
    {
        abort_unless(app(DamTableAccess::class)->canEdit($request->user(), $table), 403);
    }

    private function provider(callable $callback): mixed
    {
        try {
            return $callback();
        } catch (ConnectionException|RequestException $exception) {
            Log::warning('Google Workspace provider request failed.', [
                'exception' => $exception::class,
                'status' => $exception instanceof RequestException ? $exception->response->status() : null,
            ]);
            abort(502, 'ارتباط امن با Google Workspace ناموفق بود؛ وضعیت سرویس و دسترسی حساب سازمانی را بررسی کنید.');
        }
    }
}
