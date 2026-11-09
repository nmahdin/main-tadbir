<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\PaymentGateway;
use App\Core\Billing\PaymentService;
use App\Core\Organizations\Organization;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Subscriptions\SubscriptionFulfillment;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Subscriptions\SubscriptionOwnerResolver;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M3 payment endpoints (SPEC §3.8):
 *
 *   POST /api/v1/billing/orders/{order}/pay           initiate payment
 *   GET  /api/v1/billing/payments/{id}                status of an attempt (owner-scoped)
 *   GET  /api/v1/billing/payments/{id}/callback       provider callback (public-facing redirect target)
 *   POST /api/v1/billing/payments/{id}/callback       provider webhook (server-to-server where supported)
 *   POST /api/v1/billing/payments/{id}/reconcile      owner-triggered recovery (rate-limited)
 *
 * Cross-tenant: 404 not 403.
 */
final class BillingPaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly MembershipPermissions $permissions,
        private readonly SubscriptionOwnerResolver $owners,
        private readonly PersonalWorkspaceProvisioner $personalProvisioner,
    ) {}

    public function initiate(Request $request, CoreBillingOrder $order): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolveOrderOwner($order, $user);
        if ($owner === null) {
            return response()->json(['message' => 'سفارش یافت نشد.', 'code' => 'order_not_found'], 404);
        }

        $data = $request->validate([
            'idempotency_key' => ['nullable', 'string', 'max:80'],
            'return_url' => ['nullable', 'url', 'max:500'],
        ]);

        // Header → body idempotency, same as quote/order controllers.
        $idempotencyKey = trim((string) (
            $request->header('Idempotency-Key')
            ?? $request->header('idempotency-key')
            ?? $data['idempotency_key']
            ?? ''
        ));
        if ($idempotencyKey === '') {
            return response()->json([
                'message' => 'Idempotency-Key header or idempotency_key body is required.',
                'code' => 'payment_idempotency_key_required',
                'errors' => ['idempotency_key' => ['The idempotency key field is required.']],
            ], 422);
        }

        // Validate return_url allow-list: same host as app.url or relative.
        $returnUrl = $data['return_url'] ?? null;
        if ($returnUrl !== null && ! $this->isAllowedReturnUrl($returnUrl)) {
            return response()->json([
                'message' => 'return_url is not on an allowed origin.',
                'code' => 'payment_return_url_invalid',
            ], 422);
        }

        try {
            $result = $this->payments->initiate($user, $owner, $order, $idempotencyKey, $returnUrl);
        } catch (BillingDomainException $e) {
            return $this->domainError($e);
        }

        $payment = $result['payment'];
        $statusCode = $result['is_replay'] ? 200 : 201;

        return response()->json([
            'data' => [
                'payment' => $this->serializePayment($payment),
                'redirect_url' => $result['redirect_url'],
                'is_replay' => $result['is_replay'],
            ],
        ], $statusCode);
    }

    public function show(Request $request, CoreBillingPayment $payment): JsonResponse
    {
        $user = $request->user();
        $owner = $this->ownerFromPayment($payment);
        if (! $this->canAccessOwner($owner, $user)) {
            return response()->json(['message' => 'پرداخت یافت نشد.', 'code' => 'payment_not_found'], 404);
        }

        return response()->json(['data' => ['payment' => $this->serializePayment($payment->fresh())]]);
    }

    /**
     * Browser-return callback from the PSP. We do NOT trust this
     * request as proof of settlement — we immediately run
     * server-side verifyAndFinalize and return an opaque status.
     */
    public function callbackReturn(Request $request, CoreBillingPayment $payment)
    {
        try {
            $result = $this->payments->verifyAndFinalize(null, $payment, $request->query->all(), $request->headers->all());
        } catch (BillingDomainException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], 422);
        }
        // Dispatch outbox immediately (best effort; cron retries on crash).
        $this->dispatchOutbox();

        return response()->json(['data' => ['payment' => $this->serializePayment($result['payment']->fresh()), 'outcome' => $result['outcome']]]);
    }

    /**
     * Server-to-server webhook. Signed callback only.
     */
    public function callbackWebhook(Request $request, CoreBillingPayment $payment, PaymentGateway $gateway): JsonResponse
    {
        if (! $gateway->verifyCallbackSignature($request->query->all(), $request->headers->all())) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }
        try {
            $this->payments->verifyAndFinalize(null, $payment, $request->query->all(), $request->headers->all());
        } catch (BillingDomainException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], 422);
        }
        $this->dispatchOutbox();

        return response()->json(['ok' => true]);
    }

    public function reconcile(Request $request, CoreBillingPayment $payment): JsonResponse
    {
        $user = $request->user();
        $owner = $this->ownerFromPayment($payment);
        if (! $this->canAccessOwner($owner, $user)) {
            return response()->json(['message' => 'پرداخت یافت نشد.', 'code' => 'payment_not_found'], 404);
        }
        try {
            $result = $this->payments->verifyAndFinalize($user, $payment, [], []);
        } catch (BillingDomainException $e) {
            return $this->domainError($e);
        }
        $this->dispatchOutbox();

        return response()->json(['data' => ['payment' => $this->serializePayment($result['payment']->fresh()), 'outcome' => $result['outcome']]]);
    }

    // ---- owner resolution ----

    private function resolveOrderOwner(CoreBillingOrder $order, $user): ?SubscriptionOwner
    {
        if ($order->organization_id !== null) {
            $org = Organization::query()->find($order->organization_id);
            if ($org === null) {
                return null;
            }
            if (! $this->permissions->allows($user, $org, 'organization.billing.manage')) {
                return null;
            }

            return $this->owners->ownerForOrganization($org);
        }
        $ws = Workspace::query()->find($order->personal_workspace_id);
        if ($ws === null || ! $ws->isPersonal() || (int) $ws->owner_user_id !== (int) $user->id) {
            return null;
        }

        return $this->owners->ownerForWorkspace($ws);
    }

    private function ownerFromPayment(CoreBillingPayment $payment): SubscriptionOwner
    {
        if ($payment->organization_id !== null) {
            return $this->owners->ownerForOrganization(Organization::query()->findOrFail($payment->organization_id));
        }

        return $this->owners->ownerForWorkspace(
            Workspace::query()->findOrFail($payment->personal_workspace_id)
        );
    }

    private function canAccessOwner(SubscriptionOwner $owner, $user): bool
    {
        if ($owner->type === 'organization') {
            return $this->permissions->allows($user, $owner->organization, 'organization.billing.manage');
        }

        return (int) $owner->personalWorkspace->user_id === (int) $user->id;
    }

    private function isAllowedReturnUrl(string $url): bool
    {
        $appHost = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        $host = (string) parse_url($url, PHP_URL_HOST);
        if ($host === '') {
            return true; // relative path
        }

        return $host === $appHost;
    }

    private function dispatchOutbox(): void
    {
        try {
            $fulfillment = app(SubscriptionFulfillment::class);
            $this->payments->dispatchOutbox(function (CoreBillingFulfillmentOutbox $evt) use ($fulfillment): void {
                $fulfillment->fulfillPaid($evt);
            });
        } catch (\Throwable) {
            // Dispatcher swallows; cron will retry.
        }
    }

    private function serializePayment(CoreBillingPayment $p): array
    {
        return [
            'id' => (int) $p->id,
            'order_id' => (int) $p->order_id,
            'provider' => $p->provider,
            'status' => $p->status,
            'requested_amount_toman' => (int) $p->requested_amount_toman,
            'verified_amount_toman' => $p->verified_amount_toman !== null ? (int) $p->verified_amount_toman : null,
            'currency' => $p->requested_currency,
            'provider_transaction_id' => $p->provider_transaction_id,
            'initiated_at' => $p->initiated_at?->toIso8601String(),
            'verified_at' => $p->verified_at?->toIso8601String(),
            'finalized_at' => $p->finalized_at?->toIso8601String(),
            'fulfilled_at' => $p->fulfilled_at?->toIso8601String(),
            'failure_code' => $p->failure_code,
            'failure_reason' => $p->failure_reason,
        ];
    }

    private function domainError(BillingDomainException $e): JsonResponse
    {
        $status = match ($e->errorCode ?? 'payment_invalid') {
            'order_review_expired', 'payment_pending', 'order_payment_in_progress' => 409,
            'payment_callback_invalid', 'payment_return_url_invalid', 'payment_idempotency_key_required',
            'payment_idempotency_key_invalid', 'order_owner_mismatch', 'payment_amount_mismatch',
            'payment_currency_mismatch', 'payment_zero_invalid' => 422,
            default => 422,
        };

        return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'payment_invalid'], $status);
    }
}
