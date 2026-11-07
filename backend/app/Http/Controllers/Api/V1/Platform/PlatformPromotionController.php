<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Billing\BillingArithmeticException;
use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CorePromotion;
use App\Core\Billing\PromotionService;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M2-S2 platform promotion-code administration. Requires
 * `platform.billing.manage` (M2-D2=A). One code per quote; no
 * stacking; no redemption at S2.
 */
final class PlatformPromotionController extends Controller
{
    use AuthorizesPlatformRequests;

    public const PERMISSION = 'platform.billing.manage';

    public function index(Request $request, PromotionService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $service): JsonResponse {
            $this->platformActor($request, self::PERMISSION);
            $promos = CorePromotion::query()->orderByDesc('id')->get();

            return response()->json(['data' => ['promotions' => $promos->map(fn ($p) => $this->serialize($p))->values()->all()]]);
        });
    }

    public function store(Request $request, PromotionService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $service): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);
            $data = $request->validate([
                'code' => ['required', 'string', 'max:32'],
                'label' => ['required', 'string', 'max:120'],
                'discount_type' => ['required', 'string', 'in:percent,fixed'],
                'discount_value_bp' => ['required_if:discount_type,percent', 'nullable', 'integer', 'min:0', 'max:10000'],
                'discount_value_toman' => ['required_if:discount_type,fixed', 'nullable', 'integer', 'min:0'],
                'starts_at' => ['sometimes', 'nullable', 'date'],
                'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
                'max_redemptions' => ['sometimes', 'nullable', 'integer', 'min:0'],
                'per_owner_limit' => ['sometimes', 'nullable', 'integer', 'min:0'],
            ]);
            try {
                $promo = $service->create(
                    (string) $data['code'],
                    (string) $data['label'],
                    (string) $data['discount_type'],
                    isset($data['discount_value_bp']) ? (int) $data['discount_value_bp'] : null,
                    isset($data['discount_value_toman']) ? (int) $data['discount_value_toman'] : null,
                    $actor,
                    isset($data['starts_at']) && $data['starts_at'] !== null ? CarbonImmutable::parse($data['starts_at']) : null,
                    isset($data['ends_at']) && $data['ends_at'] !== null ? CarbonImmutable::parse($data['ends_at']) : null,
                    $data['max_redemptions'] ?? null,
                    $data['per_owner_limit'] ?? null,
                );
            } catch (BillingDomainException|BillingArithmeticException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode ?? 'promo_invalid'], 422);
            }

            return response()->json(['data' => ['promotion' => $this->serialize($promo)]], 201);
        });
    }

    public function deactivate(Request $request, CorePromotion $promotion, PromotionService $service): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $promotion, $service): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);
            $promo = $service->deactivate($promotion, $actor);

            return response()->json(['data' => ['promotion' => $this->serialize($promo)]]);
        });
    }

    private function serialize(CorePromotion $p): array
    {
        return [
            'id' => (int) $p->id,
            'code' => $p->code,
            'label' => $p->label,
            'discount_type' => $p->discount_type,
            'discount_value_bp' => $p->discount_value_bp,
            'discount_value_toman' => $p->discount_value_toman,
            'is_active' => (bool) $p->is_active,
            'starts_at' => $p->starts_at?->toIso8601String(),
            'ends_at' => $p->ends_at?->toIso8601String(),
            'max_redemptions' => $p->max_redemptions,
            'per_owner_limit' => $p->per_owner_limit,
            'redeemed_count' => (int) $p->redeemed_count,
            'deactivated_at' => $p->deactivated_at?->toIso8601String(),
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}
