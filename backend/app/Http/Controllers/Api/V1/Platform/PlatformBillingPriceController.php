<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Core\Billing\BillingArithmeticException;
use App\Core\Billing\BillingDomainException;
use App\Core\Billing\PlanPricePublisher;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Http\Controllers\Api\V1\Platform\Concerns\AuthorizesPlatformRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M2-S1 platform price-publishing administration.
 *
 * Thin HTTP layer over PlanPricePublisher. Requires
 * `platform.billing.manage`, which is distinct from
 * `platform.subscriptions.manage` (M2-D2=A). The existing
 * platform.subscriptions.manage grant never substitutes.
 *
 * No prices are auto-published; no commercial prices are
 * fabricated. Draft and published prices are surfaced read-only
 * for administrative review.
 */
final class PlatformBillingPriceController extends Controller
{
    use AuthorizesPlatformRequests;

    public const PERMISSION = 'platform.billing.manage';

    public function showPlanPrices(Request $request, string $planKey, PlanPricePublisher $publisher): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $planKey, $publisher): JsonResponse {
            $this->platformActor($request, self::PERMISSION);

            $plan = CorePlan::query()->where('key', $planKey)->firstOrFail();
            $snapshots = [];
            foreach ($plan->versions()->orderBy('version')->get() as $version) {
                $version->load(['publishedMonthlyPrice', 'publishedAnnualPrice']);
                $draftPrices = $version->published_at === null
                    ? $publisher->draftPrices($version)
                    : collect();
                $snapshots[] = [
                    'id' => (int) $version->id,
                    'version' => (int) $version->version,
                    'published_at' => $version->published_at?->toIso8601String(),
                    'published_monthly_price_id' => $version->published_monthly_price_id,
                    'published_annual_price_id' => $version->published_annual_price_id,
                    'grace_days' => (int) $version->grace_days,
                    'prices' => [
                        'monthly' => $this->serializePrice($version->publishedMonthlyPrice),
                        'annual' => $this->serializePrice($version->publishedAnnualPrice),
                    ],
                    'draft_prices' => $draftPrices->map(fn ($p) => $this->serializePrice($p))->values()->all(),
                ];
            }

            return response()->json(['data' => ['plan' => ['id' => $plan->id, 'key' => $plan->key, 'name' => $plan->name, 'audience' => $plan->audience, 'status' => $plan->status], 'versions' => $snapshots]]);
        });
    }

    public function publish(Request $request, CorePlanVersion $version, PlanPricePublisher $publisher): JsonResponse
    {
        return $this->platformRespond(function () use ($request, $version, $publisher): JsonResponse {
            $actor = $this->platformActor($request, self::PERMISSION);

            $data = $request->validate([
                'monthly_amount_toman' => ['sometimes', 'required', 'integer', 'min:0'],
                'annual_amount_toman' => ['sometimes', 'required', 'integer', 'min:0'],
            ]);

            if (! isset($data['monthly_amount_toman']) && ! isset($data['annual_amount_toman'])) {
                return response()->json([
                    'message' => 'At least one period price is required to publish.',
                    'code' => 'price_period_required',
                ], 422);
            }

            $byPeriod = [];
            if (isset($data['monthly_amount_toman'])) {
                $byPeriod['monthly'] = (int) $data['monthly_amount_toman'];
            }
            if (isset($data['annual_amount_toman'])) {
                $byPeriod['annual'] = (int) $data['annual_amount_toman'];
            }

            try {
                $result = $publisher->publishPrices($version, $byPeriod, $actor);
            } catch (BillingDomainException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], 422);
            } catch (BillingArithmeticException $e) {
                return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], 422);
            }

            return response()->json([
                'data' => [
                    'version' => [
                        'id' => (int) $result['version']->id,
                        'version' => (int) $result['version']->version,
                        'published_at' => $result['version']->published_at?->toIso8601String(),
                    ],
                    'prices' => array_map(fn ($p) => $this->serializePrice($p), $result['prices']),
                ],
            ], 201);
        });
    }

    private function serializePrice(?\App\Core\Billing\CorePlanPrice $price): ?array
    {
        if ($price === null) {
            return null;
        }

        return [
            'id' => (int) $price->id,
            'period' => $price->period,
            'amount_toman' => (int) $price->amount_toman,
            'is_published' => (bool) $price->is_published,
            'is_superseded' => (bool) $price->isSuperseded(),
            'published_at' => $price->published_at?->toIso8601String(),
            'superseded_at' => $price->superseded_at?->toIso8601String(),
        ];
    }
}
