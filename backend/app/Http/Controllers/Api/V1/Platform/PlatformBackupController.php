<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Operations\Backup\BackupJobType;
use App\Core\Operations\Backup\BackupService;
use App\Core\Operations\Backup\CoreBackupJob;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class PlatformBackupController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly BackupService $backups) {}

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.backup.manage');
        $jobs = CoreBackupJob::query()->orderByDesc('created_at')->limit(50)->get();

        return response()->json(['data' => $jobs]);
    }

    public function show(Request $request, CoreBackupJob $backupJob): JsonResponse
    {
        $this->platformActor($request, 'platform.backup.manage');

        return response()->json(['data' => $backupJob]);
    }

    public function request(Request $request): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.backup.manage');
        $validated = $request->validate([
            'type' => ['sometimes', Rule::in(['full', 'database', 'files', 'metadata'])],
        ]);
        $job = $this->backups->request($actor, BackupJobType::from($validated['type'] ?? 'full'));

        return response()->json(['data' => $job], 201);
    }

    public function execute(Request $request, CoreBackupJob $backupJob): JsonResponse
    {
        $this->platformActor($request, 'platform.backup.manage');
        $job = $this->backups->execute($backupJob);

        return response()->json(['data' => $job]);
    }
}
