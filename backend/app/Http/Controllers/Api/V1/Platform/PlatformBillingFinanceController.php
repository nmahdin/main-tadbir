<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Billing\Reconciliation\CoreBillingReconciliationFinding;
use App\Core\Billing\Reconciliation\FinancialReconciliationService;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M6 — Platform finance/reconciliation inspection.
 *
 * These endpoints require platform.billing.manage authorization
 * (handled by the PlatformAuthorizer middleware on the platform group).
 *
 * Read-only except for explicit resolve-note action; no refund, no
 * auto-correction of ambiguous state.
 */
final class PlatformBillingFinanceController extends Controller
{
    public function findings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'severity' => ['nullable', 'string', 'in:info,warning,error,critical'],
            'status' => ['nullable', 'string', 'in:open,resolved'],
            'finding_type' => ['nullable', 'string', 'max:80'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $q = CoreBillingReconciliationFinding::query()->orderByDesc('detected_at')->orderByDesc('id');
        if (isset($data['severity'])) {
            $q->where('severity', $data['severity']);
        }
        if (isset($data['status'])) {
            $q->where('status', $data['status']);
        }
        if (isset($data['finding_type'])) {
            $q->where('finding_type', $data['finding_type']);
        }
        $p = $q->paginate((int) ($data['per_page'] ?? 50));

        return response()->json([
            'data' => ['findings' => collect($p->items())->map(fn ($f) => $this->serialize($f))->values()->all()],
            'meta' => [
                'per_page' => $p->perPage(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'total' => $p->total(),
            ],
        ]);
    }

    public function showFinding(CoreBillingReconciliationFinding $finding): JsonResponse
    {
        return response()->json(['data' => ['finding' => $this->serialize($finding, true)]]);
    }

    public function resolve(Request $request, CoreBillingReconciliationFinding $finding, FinancialReconciliationService $recon): JsonResponse
    {
        $data = $request->validate([
            'resolution_note' => ['required', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        assert($user instanceof User);

        $resolved = $recon->resolveFinding($finding, $user, $data['resolution_note']);

        return response()->json(['data' => ['finding' => $this->serialize($resolved, true)]]);
    }

    public function sweep(FinancialReconciliationService $recon): JsonResponse
    {
        $summary = $recon->sweep();

        return response()->json(['data' => ['summary' => $summary]]);
    }

    private function serialize(CoreBillingReconciliationFinding $f, bool $withEvidence = false): array
    {
        $out = [
            'id' => (int) $f->id,
            'finding_type' => $f->finding_type,
            'subject_type' => $f->subject_type,
            'subject_id' => (int) $f->subject_id,
            'severity' => $f->severity,
            'status' => $f->status,
            'message' => $f->message,
            'safe_to_retry' => (bool) $f->safe_to_retry,
            'owner_key' => $f->owner_key,
            'related_payment_id' => $f->related_payment_id,
            'related_order_id' => $f->related_order_id,
            'detected_at' => $f->detected_at?->toIso8601String(),
            'resolved_at' => $f->resolved_at?->toIso8601String(),
            'resolved_by_user_id' => $f->resolved_by_user_id,
            'resolution_note' => $f->resolution_note,
        ];
        if ($withEvidence) {
            $out['evidence'] = $f->evidence;
        }

        return $out;
    }
}
