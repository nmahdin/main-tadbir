<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\OrderService;
use App\Core\Organizations\Organization;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M2-S4 order review endpoints (SPEC §3.8):
 *
 *   POST /api/v1/billing/quotes/{quote}/convert       (owner / org.billing.manage)
 *   GET  /api/v1/billing/orders/{id}                  (owner-scoped; 404 cross-owner)
 *   GET  /api/v1/billing/orders                       (personal list)
 *   GET  /api/v1/billing/orders/organizations/{org}   (org list)
 *   POST /api/v1/billing/orders/{id}/cancel           (owner / org.billing.manage)
 *
 * S4 is order-review only; payment_initiated is always false.
 * Cancelled / review-expired orders cannot be reactivated.
 */
final class BillingOrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly MembershipPermissions $permissions,
        private readonly PersonalWorkspaceProvisioner $personalProvisioner,
    ) {}

    public function convert(Request $request, CoreBillingQuote $quote): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolveQuoteOwner($quote, $user);
        if ($owner === null) {
            return response()->json(['message' => 'پیش‌فاکتور یافت نشد.', 'code' => 'quote_not_found'], 404);
        }

        // Validate the JSON body idempotency_key only when the header is
        // absent. Laravel's validator cannot see HTTP headers through
        // required_without, so we key the condition manually.
        $data = $request->validate([
            'idempotency_key' => ['nullable', 'string', 'max:80'],
        ]);
        if ($request->hasHeader('Idempotency-Key')) {
            // Prefer header; body field is irrelevant in that branch.
        } elseif ($request->hasHeader('idempotency-key')) {
            // All lowercase variant from some clients.
        } elseif (!array_key_exists('idempotency_key', $data) || $data['idempotency_key'] === null || $data['idempotency_key'] === '') {
            return response()->json([
                'message' => 'Idempotency-Key header or idempotency_key body is required.',
                'code' => 'order_idempotency_key_required',
                'errors' => ['idempotency_key' => ['The idempotency key field is required when Idempotency-Key header is not present.']],
            ], 422);
        }
        $idempotencyKey = trim((string) (
            $request->header('Idempotency-Key')
            ?? $request->header('idempotency-key')
            ?? $data['idempotency_key']
            ?? throw new BillingDomainException('order_idempotency_key_required', 'Idempotency-Key header or body is required.')
        ));

        try {
            $result = $this->orders->convert(
                actor: $user,
                owner: $owner,
                quote: $quote,
                idempotencyKey: $idempotencyKey,
            );
        } catch (BillingDomainException $e) {
            $status = match ($e->errorCode ?? 'order_invalid') {
                'quote_expired', 'quote_superseded', 'quote_already_converted',
                'order_review_expired' => 409,
                'order_idempotency_key_invalid', 'order_idempotency_payload_mismatch',
                'order_owner_mismatch', 'quote_owner_mismatch' => 422,
                default => 422,
            };

            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'order_invalid'], $status);
        }

        $status = $result['is_replay'] ? 200 : 201;

        return response()->json([
            'data' => ['order' => $this->serialize($result['order'], CarbonImmutable::now()), 'is_replay' => $result['is_replay']],
        ], $status);
    }

    public function show(Request $request, CoreBillingOrder $order): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolveOrderOwner($order, $user);
        if ($owner === null) {
            return response()->json(['message' => 'سفارش یافت نشد.', 'code' => 'order_not_found'], 404);
        }
        $loaded = $this->orders->findForOwner((int) $order->id, $owner);
        if ($loaded === null) {
            return response()->json(['message' => 'سفارش یافت نشد.', 'code' => 'order_not_found'], 404);
        }

        return response()->json(['data' => ['order' => $this->serialize($loaded, CarbonImmutable::now())]]);
    }

    public function indexForPersonal(Request $request): JsonResponse
    {
        $user = $request->user();
        $workspace = $this->personalProvisioner->ensureDefault($user);
        $owner = new SubscriptionOwner('personal', null, $workspace);
        $paginator = $this->orders->listForOwner($owner);

        return $this->respondPage($paginator);
    }

    public function indexForOrganization(Request $request, Organization $organization): JsonResponse
    {
        $user = $request->user();
        if (! $this->permissions->userHasOrganizationPermission($user, $organization, 'organization.billing.manage')) {
            return $this->forbidden('دسترسی مدیریت سفارش‌ها برای این سازمان مجاز نیست.');
        }
        if ($organization->status !== 'active') {
            return response()->json(['message' => 'سازمان در وضعیت فعال قرار ندارد.', 'code' => 'organization_inactive'], 422);
        }
        $owner = new SubscriptionOwner('organization', $organization, null);
        $paginator = $this->orders->listForOwner($owner);

        return $this->respondPage($paginator);
    }

    public function cancel(Request $request, CoreBillingOrder $order): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolveOrderOwner($order, $user);
        if ($owner === null) {
            return response()->json(['message' => 'سفارش یافت نشد.', 'code' => 'order_not_found'], 404);
        }

        try {
            $cancelled = $this->orders->cancel($user, $owner, (int) $order->id);
        } catch (BillingDomainException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'order_cancel_failed'], 409);
        }

        return response()->json(['data' => ['order' => $this->serialize($cancelled, CarbonImmutable::now())]]);
    }

    // ---------- helpers ----------

    private function resolveQuoteOwner(CoreBillingQuote $quote, User $user): ?SubscriptionOwner
    {
        if ($quote->organization_id !== null) {
            $org = Organization::query()->find($quote->organization_id);
            if ($org === null) {
                return null;
            }
            if (! $this->permissions->userHasOrganizationPermission($user, $org, 'organization.billing.manage')) {
                return null;
            }

            return new SubscriptionOwner('organization', $org, null);
        }
        if ($quote->personal_workspace_id !== null) {
            $ws = Workspace::query()->find($quote->personal_workspace_id);
            if ($ws === null) {
                return null;
            }
            if ((int) $ws->owner_user_id !== (int) $user->id) {
                return null;
            }

            return new SubscriptionOwner('personal', null, $ws);
        }

        return null;
    }

    private function resolveOrderOwner(CoreBillingOrder $order, User $user): ?SubscriptionOwner
    {
        if ($order->organization_id !== null) {
            $org = Organization::query()->find($order->organization_id);
            if ($org === null) {
                return null;
            }
            if (! $this->permissions->userHasOrganizationPermission($user, $org, 'organization.billing.manage')) {
                return null;
            }

            return new SubscriptionOwner('organization', $org, null);
        }
        if ($order->personal_workspace_id !== null) {
            $ws = Workspace::query()->find($order->personal_workspace_id);
            if ($ws === null) {
                return null;
            }
            if ((int) $ws->owner_user_id !== (int) $user->id) {
                return null;
            }

            return new SubscriptionOwner('personal', null, $ws);
        }

        return null;
    }

    private function respondPage($paginator): JsonResponse
    {
        $at = CarbonImmutable::now();

        return response()->json([
            'data' => [
                'orders' => collect($paginator->items())->map(fn ($o) => $this->serialize($o, $at))->values()->all(),
            ],
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    private function serialize(CoreBillingOrder $order, CarbonImmutable $at): array
    {
        $lines = $order->lines->map(fn ($l) => [
            'id' => (int) $l->id,
            'kind' => $l->kind,
            'description' => $l->description,
            'amount_toman' => (int) $l->amount_toman,
            'tax_rate_basis_points' => $l->tax_rate_basis_points !== null ? (int) $l->tax_rate_basis_points : null,
        ])->values()->all();

        $reviewRemaining = $order->status === CoreBillingOrder::STATUS_IN_REVIEW
            ? max(0, $order->review_expires_at->getTimestamp() - $at->getTimestamp())
            : 0;

        return [
            'id' => (int) $order->id,
            'quote_id' => (int) $order->quote_id,
            'owner_key' => $order->owner_key,
            'organization_id' => $order->organization_id,
            'personal_workspace_id' => $order->personal_workspace_id,
            'period' => $order->period,
            'subtotal_toman' => (int) $order->subtotal_toman,
            'discount_toman' => (int) $order->discount_toman,
            'tax_toman' => (int) $order->tax_toman,
            'total_toman' => (int) $order->total_toman,
            'promotion' => $order->promo ? [
                'id' => (int) $order->promo->id,
                'code' => $order->promo_code_snapshot ?? $order->promo->code,
            ] : null,
            'tax' => $order->taxRule ? [
                'id' => (int) $order->taxRule->id,
                'rate_basis_points' => (int) ($order->tax_rate_basis_points ?? 0),
            ] : null,
            'status' => $order->status,
            'review_expires_at' => $order->review_expires_at?->toIso8601String(),
            'review_remaining_seconds' => $reviewRemaining,
            'cancelled_at' => $order->cancelled_at?->toIso8601String(),
            'expired_at' => $order->expired_at?->toIso8601String(),
            'created_at' => $order->created_at?->toIso8601String(),
            'lines' => $lines,
            'payment_initiated' => false,
        ];
    }

    private function forbidden(string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'code' => 'billing_forbidden'], 403);
    }
}
