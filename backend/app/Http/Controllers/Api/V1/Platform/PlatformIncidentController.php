<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Operations\Incidents\CoreAlert;
use App\Core\Operations\Incidents\CoreIncident;
use App\Core\Operations\Incidents\IncidentService;
use App\Core\Operations\Incidents\IncidentSeverity;
use App\Core\Operations\Incidents\IncidentStatus;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use App\Models\User;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class PlatformIncidentController extends Controller
{
    use AuthorizesPlatformRequests;

    public function __construct(private readonly IncidentService $service) {}

    public function incidents(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.incidents.manage');
        $perPage = max(1, min($request->integer('per_page', 30), 100));
        $q = CoreIncident::query()->orderByDesc('opened_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        $page = $q->paginate($perPage);

        return response()->json(['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    public function showIncident(Request $request, CoreIncident $incident): JsonResponse
    {
        $this->platformActor($request, 'platform.incidents.manage');
        $incident->load(['activity', 'alerts', 'assignee']);

        return response()->json(['data' => $incident]);
    }

    public function openIncident(Request $request): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.incidents.manage');
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'severity' => ['required', Rule::in(['critical', 'high', 'medium', 'low', 'info'])],
            'summary' => ['nullable', 'string', 'max:5000'],
        ]);

        return $this->platformRespond(function () use ($actor, $validated): JsonResponse {
            $incident = $this->service->openIncident(
                $actor,
                $validated['title'],
                IncidentSeverity::from($validated['severity']),
                $validated['summary'] ?? null,
            );

            return response()->json(['data' => $incident], 201);
        });
    }

    public function transition(Request $request, CoreIncident $incident): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.incidents.manage');
        $validated = $request->validate([
            'status' => ['required', Rule::in(['acknowledged', 'investigating', 'mitigated', 'resolved', 'open'])],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        return $this->platformRespond(function () use ($actor, $incident, $validated): JsonResponse {
            try {
                $incident = $this->service->transition($actor, $incident, IncidentStatus::from($validated['status']), $validated['notes'] ?? null);
            } catch (DomainException $e) {
                return response()->json(['error' => ['code' => 'invalid_transition', 'message' => $e->getMessage()]], 409);
            }

            return response()->json(['data' => $incident]);
        });
    }

    public function assign(Request $request, CoreIncident $incident): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.incidents.manage');
        $validated = $request->validate([
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);
        $assignee = isset($validated['assignee_id']) ? User::findOrFail($validated['assignee_id']) : null;
        $incident = $this->service->assign($actor, $incident, $assignee);

        return response()->json(['data' => $incident]);
    }

    public function alerts(Request $request): JsonResponse
    {
        $this->platformActor($request, 'platform.incidents.manage');
        $perPage = max(1, min($request->integer('per_page', 30), 100));
        $q = CoreAlert::query()->orderByDesc('last_observed_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        $page = $q->paginate($perPage);

        return response()->json(['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    public function acknowledgeAlert(Request $request, CoreAlert $alert): JsonResponse
    {
        $actor = $this->platformActor($request, 'platform.incidents.manage');
        $alert = $this->service->acknowledgeAlert($actor, $alert);

        return response()->json(['data' => $alert]);
    }

    public function resolveAlert(Request $request, CoreAlert $alert): JsonResponse
    {
        $this->platformActor($request, 'platform.incidents.manage');
        $this->service->resolveAlert($alert);

        return response()->json(['data' => $alert]);
    }
}
