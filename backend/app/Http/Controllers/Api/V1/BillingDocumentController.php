<? php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\CoreBillingDocument;
use App\Core\Billing\FinancialDocumentService;
use App\Core\Organizations\Organization;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M5 — Owner-scoped financial document endpoints.
 *
 *   GET /api/v1/billing/documents                                    owner / org.billing.manage
 *   GET /api/v1/billing/documents/organizations/{org}                org.billing.manage
 *   GET /api/v1/billing/documents/{document}                         owner-scoped detail
 *   GET /api/v1/billing/documents/{document}/render                  render data (RTL/Persian)
 *
 * Cross-tenant access MUST return 404 (never 403) to avoid existence leakage.
 * PSP trace IDs / raw provider metadata are NOT returned through owner endpoints.
 */
final class BillingDocumentController extends Controller
{
    public function __construct(
        private readonly FinancialDocumentService $documents,
        private readonly MembershipPermissions $permissions,
    ) {}

    public function indexForPersonal(Request $request): JsonResponse
    {
        $user = $request->user();
        $ws = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);
        $ownerKey = 'ws:'.$ws->id;

        return $this->indexByOwnerKey($request, $ownerKey);
    }

    public function indexForOrganization(Request $request, Organization $organization): JsonResponse
    {
        $user = $request->user();
        if (! $this->permissions->userHasOrganizationPermission($user, $organization, 'organization.billing.manage')) {
            return response()->json(['message' => 'دسترسی مجاز نیست.', 'code' => 'forbidden'], 403);
        }
        $ownerKey = 'org:'.$organization->id;

        return $this->indexByOwnerKey($request, $ownerKey);
    }

    public function show(Request $request, CoreBillingDocument $document): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccess($user, $document)) {
            return response()->json(['message' => 'سند یافت نشد.', 'code' => 'document_not_found'], 404);
        }
        $document->loadMissing(['order', 'payment', 'relatedInvoice']);

        return response()->json([
            'data' => ['document' => $this->serializeDocument($document)],
        ]);
    }

    public function render(Request $request, CoreBillingDocument $document): JsonResponse
    {
        $user = $request->user();
        if (! $this->canAccess($user, $document)) {
            return response()->json(['message' => 'سند یافت نشد.', 'code' => 'document_not_found'], 404);
        }

        return response()->json([
            'data' => ['render' => $this->documents->renderDocument($document)],
        ]);
    }

    private function indexByOwnerKey(Request $request, string $ownerKey): JsonResponse
    {
        $data = $request->validate([
            'type' => ['nullable', 'string', 'in:invoice,receipt'],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = CoreBillingDocument::query()->forOwner($ownerKey)->with(['order', 'payment', 'relatedInvoice']);
        if (isset($data['type'])) {
            $query->where('doc_type', $data['type']);
        }
        if (isset($data['order_id'])) {
            $query->where('order_id', (int) $data['order_id']);
        }
        $query->orderByDesc('issued_at')->orderByDesc('id');
        $paginator = $query->paginate((int) ($data['per_page'] ?? 25));

        return response()->json([
            'data' => [
                'documents' => collect($paginator->items())->map(fn (CoreBillingDocument $d) => $this->serializeDocument($d))->values()->all(),
            ],
            'meta' => [
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    private function canAccess(User $user, CoreBillingDocument $document): bool
    {
        if (! $document->relationLoaded('order')) {
            $document->load('order');
        }
        $order = $document->order;
        if (! $order) {
            return false;
        }
        if ($order->organization_id !== null) {
            $org = Organization::query()->find($order->organization_id);
            if ($org === null) {
                return false;
            }

            return $this->permissions->userHasOrganizationPermission($user, $org, 'organization.billing.manage');
        }
        if ($order->personal_workspace_id !== null) {
            $ws = Workspace::query()->find($order->personal_workspace_id);
            if ($ws === null) {
                return false;
            }

            return (int) $ws->owner_user_id === (int) $user->id;
        }

        return false;
    }

    private function serializeDocument(CoreBillingDocument $d): array
    {
        return [
            'id' => (int) $d->id,
            'type' => $d->doc_type,
            'status' => $d->status,
            'number' => $d->doc_number,
            'owner_key' => $d->owner_key,
            'order_id' => (int) $d->order_id,
            'payment_id' => $d->payment_id !== null ? (int) $d->payment_id : null,
            'related_invoice_id' => $d->related_invoice_id !== null ? (int) $d->related_invoice_id : null,
            'currency' => $d->currency_code,
            'subtotal_toman' => (int) $d->subtotal_toman,
            'discount_toman' => (int) $d->discount_toman,
            'tax_toman' => (int) $d->tax_toman,
            'total_toman' => (int) $d->total_toman,
            'issued_at' => $d->issued_at?->toIso8601String(),
            'voided_at' => $d->voided_at?->toIso8601String(),
            'created_at' => $d->created_at?->toIso8601String(),
        ];
    }
}
