<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Operations\Maintenance\CoreMaintenanceWindow;
use App\Core\Operations\Maintenance\MaintenanceService;
use App\Core\Operations\Maintenance\MaintenanceStatus;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class PlatformMaintenanceController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly MaintenanceService $service) {}

    public function index(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.maintenance.manage');
        $windows = CoreMaintenanceWindow::query()
            ->orderByDesc('scheduled_start')
            ->limit(50)->get();

        return response()->json(['data' => $windows]);
    }

    public function current(Request $request): JsonResponse
    {
        // Publicly visible (no auth required) so clients can render
        // banners; sensitive details remain behind manage permission.
        $current = $this->service->current();
        $next = $this->service->nextScheduled();

        return response()->json([
            'data' => [
                'active' => $current ? [
                    'title' => $current->title,
                    'scope' => $current->scope,
                    'scheduled_end' => $current->scheduled_end?->toIso8601String(),
                ] : null,
                'next' => $next ? [
                    'title' => $next->title,
                    'scope' => $next->scope,
                    'scheduled_start' => $next->scheduled_start?->toIso8601String(),
                    'scheduled_end' => $next->scheduled_end?->toIso8601String(),
                ] : null,
            ],
        ]);
    }

    public function schedule(Request $request): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.maintenance.manage');
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'scope' => ['required', 'string', 'in:platform,billing,messaging,full'],
            'reason' => ['nullable', 'string', 'max:5000'],
            'scheduled_start' => ['required', 'date'],
            'scheduled_end' => ['required', 'date', 'after:scheduled_start'],
        ]);

        return $this->platformRespond(function () use ($actor, $validated): JsonResponse {
            try {
                $window = $this->service->schedule($actor, $validated);
            } catch (DomainException $e) {
                return response()->json(['error' => ['code' => 'invalid_window', 'message' => $e->getMessage()]], 409);
            }

            return response()->json(['data' => $window], 201);
        });
    }

    public function activate(Request $request, CoreMaintenanceWindow $window): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.maintenance.manage');

        return $this->platformRespond(function () use ($actor, $window): JsonResponse {
            try {
                $w = $this->service->activate($actor, $window);
            } catch (DomainException $e) {
                return response()->json(['error' => ['code' => 'invalid_state', 'message' => $e->getMessage()]], 409);
            }

            return response()->json(['data' => $w]);
        });
    }

    public function complete(Request $request, CoreMaintenanceWindow $window): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.maintenance.manage');

        return $this->platformRespond(function () use ($actor, $window): JsonResponse {
            try {
                $w = $this->service->complete($actor, $window);
            } catch (DomainException $e) {
                return response()->json(['error' => ['code' => 'invalid_state', 'message' => $e->getMessage()]], 409);
            }

            return response()->json(['data' => $w]);
        });
    }

    public function cancel(Request $request, CoreMaintenanceWindow $window): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.maintenance.manage');

        return $this->platformRespond(function () use ($actor, $window): JsonResponse {
            try {
                $w = $this->service->cancel($actor, $window);
            } catch (DomainException $e) {
                return response()->json(['error' => ['code' => 'invalid_state', 'message' => $e->getMessage()]], 409);
            }

            return response()->json(['data' => $w]);
        });
    }
}
