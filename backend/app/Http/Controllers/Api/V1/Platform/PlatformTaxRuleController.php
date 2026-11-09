<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Billing\BillingArithmeticException;
use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreTaxRule;
use App\Core\Billing\TaxRuleService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M2-S2 platform tax-rule administration. Requires
 * `platform.billing.manage` (M2-D2=A). At most one rule active at a
 * time (Q3=A); rates are integer basis points.
 */
final class PlatformTaxRuleController extends Controller
{
    use AuthorizesPlatformRequests;

    public const PERMISSION = 'platform.billing.manage';

    public function index(Request $request, TaxRuleService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request): JsonResponse {
            $this->platformActor($request, self::PERMISSION);
            $rules = CoreTaxRule::query()->orderByDesc('id')->get();

            return response()->json(['data' => ['rules' => $rules->map(fn ($r) => $this->serialize($r))->values()->all()]]);
        });
    }

    public function active(Request $request, TaxRuleService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $service): JsonResponse {
            $this->platformActor($request, self::PERMISSION);
            $rule = $service->activeRuleAt();

            return response()->json(['data' => ['rule' => $rule ? $this->serialize($rule) : null]]);
        });
    }

    public function store(Request $request, TaxRuleService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $service): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);
            $data = $request->validate([
                'label' => ['required', 'string', 'max:120'],
                'rate_basis_points' => ['required', 'integer', 'min:0', 'max:10000'],
                'activate' => ['sometimes', 'boolean'],
                'valid_from' => ['sometimes', 'nullable', 'date'],
                'valid_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:valid_from'],
            ]);
            try {
                $rule = $service->createRule(
                    (string) $data['label'],
                    (int) $data['rate_basis_points'],
                    $actor,
                    (bool) ($data['activate'] ?? false),
                    isset($data['valid_from']) && $data['valid_from'] !== null ? CarbonImmutable::parse($data['valid_from']) : null,
                    isset($data['valid_until']) && $data['valid_until'] !== null ? CarbonImmutable::parse($data['valid_until']) : null,
                );
            } catch (BillingDomainException|BillingArithmeticException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'rule_invalid'], 422);
            }

            return response()->json(['data' => ['rule' => $this->serialize($rule)]], 201);
        });
    }

    public function activate(Request $request, CoreTaxRule $rule, TaxRuleService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $rule, $service): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);
            $rule = $service->activate($rule, $actor);

            return response()->json(['data' => ['rule' => $this->serialize($rule)]]);
        });
    }

    public function deactivate(Request $request, CoreTaxRule $rule, TaxRuleService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $rule, $service): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);
            $rule = $service->deactivate($rule, $actor);

            return response()->json(['data' => ['rule' => $this->serialize($rule)]]);
        });
    }

    private function serialize(CoreTaxRule $rule): array
    {
        return [
            'id' => (int) $rule->id,
            'label' => $rule->label,
            'rate_basis_points' => (int) $rule->rate_basis_points,
            'is_active' => (bool) $rule->is_active,
            'valid_from' => $rule->valid_from?->toIso8601String(),
            'valid_until' => $rule->valid_until?->toIso8601String(),
            'deactivated_at' => $rule->deactivated_at?->toIso8601String(),
            'created_at' => $rule->created_at?->toIso8601String(),
        ];
    }
}
