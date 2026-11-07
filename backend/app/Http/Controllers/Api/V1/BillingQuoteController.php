<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\BillingArithmeticException;
use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\CatalogService;
use App\Core\Billing\QuoteService;
use App\Core\Organizations\Organization;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
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
 * C5-M2-S3 owner-scoped quote endpoints (SPEC §3.8):
 *
 *   POST /api/v1/billing/quotes/personal       (authenticated, personal owner)
 *   POST /api/v1/billing/quotes/organizations/{org}   (organization.billing.manage)
 *   GET  /api/v1/billing/quotes/{id}           (owner-scoped; 404 cross-owner)
 *   GET  /api/v1/billing/quotes                (owner list, default personal)
 *   GET  /api/v1/billing/quotes/organizations/{org}   (org list)
 *
 * Idempotency via the `Idempotency-Key` header (or JSON body field).
 * Personal workspace is resolved from the authenticated user's
 * default personal workspace; the organization endpoint requires
 * organization.billing.manage for that organization.
 */
final class BillingQuoteController extends Controller
{
    public function __construct(
        private readonly QuoteService $quotes,
        private readonly MembershipPermissions $permissions,
        private readonly PersonalWorkspaceProvisioner $personalProvisioner,
    ) {}

    public function indexForPersonal(Request $request): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolvePersonalOwner($user);
        $paginator = $this->quotes->listForOwner($owner);

        return $this->respondPage($paginator, $owner);
    }

    public function indexForOrganization(Request $request, Organization $organization): JsonResponse
    {
        $user = $request->user();
        if (! $this->permissions->userHasOrganizationPermission($user, $organization, 'organization.billing.manage')) {
            return $this->forbidden('دسترسی مدیریت صدور پیش‌فاکتور/فاکتور برای این سازمان مجاز نیست.');
        }
        if ($organization->status !== 'active') {
            return response()->json(['message' => 'سازمان در وضعیت فعال قرار ندارد.', 'code' => 'organization_inactive'], 422);
        }
        $owner = new SubscriptionOwner('organization', $organization, null);
        $paginator = $this->quotes->listForOwner($owner);

        return $this->respondPage($paginator, $owner);
    }

    public function createForPersonal(Request $request): JsonResponse
    {
        return $this->createQuote($request, function (User $user): ?SubscriptionOwner {
            return $this->resolvePersonalOwner($user);
        });
    }

    public function createForOrganization(Request $request, Organization $organization): JsonResponse
    {
        return $this->createQuote($request, function (User $user) use ($organization): ?SubscriptionOwner {
            if (! $this->permissions->userHasOrganizationPermission($user, $organization, 'organization.billing.manage')) {
                abort(403);
            }
            if ($organization->status !== 'active') {
                throw new BillingDomainException('organization_inactive', 'سازمان در وضعیت فعال قرار ندارد.');
            }

            return new SubscriptionOwner('organization', $organization, null);
        });
    }

    public function show(Request $request, CoreBillingQuote $quote): JsonResponse
    {
        $user = $request->user();
        $owner = $this->resolveQuoteOwner($quote, $user);
        if ($owner === null) {
            return response()->json(['message' => 'پیش‌فاکتور یافت نشد.', 'code' => 'quote_not_found'], 404);
        }
        $loaded = $this->quotes->findForOwner((int) $quote->id, $owner);
        if ($loaded === null) {
            return response()->json(['message' => 'پیش‌فاکتور یافت نشد.', 'code' => 'quote_not_found'], 404);
        }

        return response()->json(['data' => ['quote' => $this->serialize($loaded, CarbonImmutable::now())]]);
    }

    // ---------- helpers ----------

    private function createQuote(Request $request, callable $resolveOwner): JsonResponse
    {
        $user = $request->user();

        try {
            $owner = $resolveOwner($user);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return $this->forbidden('دسترسی برای ایجاد پیش‌فاکتور در این محدوده مجاز نیست.');
        }

        $data = $request->validate([
            'plan_version_id' => ['required', 'integer', 'exists:core_plan_versions,id'],
            'period' => ['required', 'string', 'in:monthly,quarterly,annual'],
            'promo_code' => ['sometimes', 'nullable', 'string', 'max:32'],
            'idempotency_key' => ['required_without:Idempotency-Key', 'nullable', 'string', 'max:80'],
        ]);

        $idempotencyKey = (string) ($request->header('Idempotency-Key')
            ?? $data['idempotency_key']
            ?? throw new BillingDomainException('quote_idempotency_key_required', 'Idempotency-Key header or body is required.'));
        $idempotencyKey = trim($idempotencyKey);

        try {
            $planVersion = CorePlanVersion::query()->with('plan')->findOrFail((int) $data['plan_version_id']);
            $result = $this->quotes->create(
                actor: $user,
                owner: $owner,
                planVersion: $planVersion,
                period: (string) $data['period'],
                promoCode: $data['promo_code'] ?? null,
                idempotencyKey: $idempotencyKey,
            );
        } catch (BillingDomainException|BillingArithmeticException $e) {
            $status = match ($e->errorCode ?? 'quote_invalid') {
                'price_unavailable', 'plan_inactive', 'plan_audience_mismatch', 'period_invalid',
                'promo_not_found', 'promo_inactive', 'promo_capacity_exceeded', 'promo_owner_limit',
                'promo_code_invalid', 'promo_code_exists', 'quote_idempotency_key_invalid',
                'quote_idempotency_key_conflict', 'quote_idempotency_key_required',
                'organization_inactive', 'owner_invalid', 'money_negative', 'amount_out_of_bounds' => 422,
                default => 422,
            };

            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'quote_invalid'], $status);
        }

        $quote = $result['quote']->fresh(['price', 'planVersion.plan', 'promo', 'taxRule']);
        $status = $result['is_replay'] ? 200 : 201;

        return response()->json([
            'data' => ['quote' => $this->serialize($quote, CarbonImmutable::now()), 'is_replay' => $result['is_replay']],
        ], $status);
    }

    private function resolvePersonalOwner(User $user): SubscriptionOwner
    {
        // ensureDefault is idempotent: creates the default personal workspace
        // on first call, returns the existing default thereafter.
        $workspace = $this->personalProvisioner->ensureDefault($user);

        return new SubscriptionOwner('personal', null, $workspace);
    }

    /**
     * Resolve owner for a quote being viewed; returns null if the actor
     * does not own the quote (organization requires billing.manage).
     */
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

    private function respondPage($paginator, SubscriptionOwner $owner): JsonResponse
    {
        $at = CarbonImmutable::now();

        return response()->json([
            'data' => [
                'quotes' => collect($paginator->items())->map(fn ($q) => $this->serialize($q, $at))->values()->all(),
            ],
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    private function serialize(CoreBillingQuote $quote, CarbonImmutable $at): array
    {
        $price = $quote->price;
        $planVersion = $quote->planVersion;
        $plan = $planVersion?->plan;

        return [
            'id' => (int) $quote->id,
            'owner_key' => $quote->owner_key,
            'organization_id' => $quote->organization_id,
            'personal_workspace_id' => $quote->personal_workspace_id,
            'plan' => $plan ? ['id' => (int) $plan->id, 'key' => $plan->key, 'name' => $plan->name, 'audience' => $plan->audience] : null,
            'plan_version_id' => (int) $quote->plan_version_id,
            'price_id' => (int) $quote->price_id,
            'period' => $quote->period,
            'subtotal_toman' => (int) $quote->subtotal_toman,
            'discount_toman' => (int) $quote->discount_toman,
            'tax_toman' => (int) $quote->tax_toman,
            'total_toman' => (int) $quote->total_toman,
            'promotion' => $quote->promo ? [
                'id' => (int) $quote->promo->id,
                'code' => $quote->promo_code_snapshot ?? $quote->promo->code,
                'discount_type' => $quote->promo->discount_type,
                'discount_value_bp' => $quote->promo->discount_value_bp,
                'discount_value_toman' => $quote->promo->discount_value_toman,
            ] : null,
            'tax' => $quote->taxRule ? [
                'id' => (int) $quote->taxRule->id,
                'rate_basis_points' => (int) ($quote->tax_rate_basis_points ?? 0),
            ] : null,
            'status' => $quote->status,
            'expires_at' => $quote->expires_at?->toIso8601String(),
            'remaining_seconds' => $quote->remainingSeconds($at),
            'converted_at' => $quote->converted_at?->toIso8601String(),
            'superseded_by_quote_id' => $quote->superseded_by_quote_id,
            'created_at' => $quote->created_at?->toIso8601String(),
            'payment_initiated' => false,
        ];
    }

    private function forbidden(string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'code' => 'billing_forbidden'], 403);
    }
}
