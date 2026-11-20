<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Operations\Backup\CoreBackupJob;
use App\Core\Operations\Restore\RestoreService;
use App\Core\Operations\Restore\CoreRestoreVerification;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PlatformRestoreController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly RestoreService $restore) {}

    public function request(Request $request, CoreBackupJob $backupJob): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.restore.execute');
        $verification = $this->restore->requestVerification($backupJob, $actor);

        return response()->json(['data' => $verification], 201);
    }

    public function preflight(Request $request, CoreRestoreVerification $verification): JsonResponse
    {
        $this->platformActor($request, 'platform.restore.execute');
        $result = $this->restore->preflight($verification);

        return response()->json(['data' => ['verification' => $verification->fresh(), 'result' => $result]]);
    }

    public function verify(Request $request, CoreRestoreVerification $verification): JsonResponse
    {
        $this->platformActor($request, 'platform.restore.execute');
        $result = $this->restore->verify($verification);

        return response()->json([
            'data' => ['verification' => $verification->fresh(), 'result' => $result],
        ], $result['ok'] ? 200 : 422);
    }

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.backup.manage');
        $rows = CoreRestoreVerification::query()
            ->orderByDesc('created_at')->limit(50)->get();

        return response()->json(['data' => $rows]);
    }
}
