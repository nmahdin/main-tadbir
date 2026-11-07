<?php

namespace App\Http\Controllers\Api\V1;

use App\Core\Billing\CatalogService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C5-M2-S2 public commercial catalog (authenticated).
 *
 * Read-only; returns ACTIVE plans with a published version and at
 * least one published period price. Missing periods are surfaced as
 * null (M2-D5=A). No pricing is derived. Requires authentication
 * (auth:sanctum + active-account) but no specific billing permission
 * — any authenticated user (including prospective buyers) may read
 * the catalog.
 */
final class BillingCatalogController extends Controller
{
    public function index(Request $request, CatalogService $catalog): JsonResponse
    {
        $entries = $catalog->publicCatalog()->map(function (array $entry): array {
            return [
                'plan' => [
                    'id' => (int) $entry['plan']->id,
                    'key' => $entry['plan']->key,
                    'name' => $entry['plan']->name,
                    'audience' => $entry['plan']->audience,
                ],
                'version' => [
                    'id' => (int) $entry['version']->id,
                    'version' => (int) $entry['version']->version,
                ],
                'prices' => [
                    'monthly' => $this->price($entry['monthly']),
                    'quarterly' => $this->price($entry['quarterly']),
                    'annual' => $this->price($entry['annual']),
                ],
            ];
        })->values();

        return response()->json(['data' => ['plans' => $entries]]);
    }

    private function price($price): ?array
    {
        if ($price === null) {
            return null;
        }

        return [
            'id' => (int) $price->id,
            'period' => $price->period,
            'amount_toman' => (int) $price->amount_toman,
        ];
    }
}
