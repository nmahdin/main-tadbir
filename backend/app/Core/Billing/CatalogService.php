<?php

namespace App\Core\Billing;

use App\Core\Plans\CorePlan;
use Illuminate\Support\Collection;

/**
 * C5-M2-S2 read-only commercial catalog.
 *
 * Returns published, purchasable plans and prices only. A price is
 * offered iff the plan is active AND its latest published version
 * has a non-null published pointer for that period. Missing or
 * unpublished periods return null (M2-D5=A) — never derived from
 * another period.
 *
 * No filtering/hiding by unavailability is performed here (Q5 is
 * still open, presentation-level); the caller decides presentation.
 * However, only plans with at least one published price are
 * returned — a plan with no published prices is not catalog-ready.
 */
final class CatalogService
{
    /**
     * @return Collection<int, array{plan: CorePlan, version: \App\Core\Plans\CorePlanVersion, monthly: ?CorePlanPrice, quarterly: ?CorePlanPrice, annual: ?CorePlanPrice}>
     */
    public function publicCatalog(): Collection
    {
        return CorePlan::query()
            ->where('status', CorePlan::STATUS_ACTIVE)
            ->with(['versions' => function ($q): void {
                $q->whereNotNull('published_at')
                    ->orderByDesc('version')
                    ->with(['publishedMonthlyPrice', 'publishedQuarterlyPrice', 'publishedAnnualPrice']);
            }])
            ->get()
            ->map(function (CorePlan $plan): ?array {
                /** @var \App\Core\Plans\CorePlanVersion|null $version */
                $version = $plan->versions->first();
                if ($version === null) {
                    return null;
                }
                $entry = [
                    'plan' => $plan,
                    'version' => $version,
                    'monthly' => $version->publishedMonthlyPrice,
                    'quarterly' => $version->publishedQuarterlyPrice,
                    'annual' => $version->publishedAnnualPrice,
                ];
                // Catalog-ready only if at least one period has a
                // published price.
                if ($entry['monthly'] === null && $entry['quarterly'] === null && $entry['annual'] === null) {
                    return null;
                }

                return $entry;
            })
            ->filter()
            ->values();
    }
}
