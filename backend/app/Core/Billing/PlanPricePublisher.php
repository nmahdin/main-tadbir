<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * C5-M2-S1 price-revision publication service.
 *
 * Enforces the published-price concurrency invariant (SPEC-C5-M2
 * §3.2) using three cooperating mechanisms:
 *  1. Canonical nullable FK pointers (published_monthly_price_id,
 *     published_annual_price_id) on core_plan_versions — the
 *     published price for a period IS the pointed row.
 *  2. A serialized publication transaction that locks the
 *     plan-version row FOR UPDATE first, supersedes the
 *     previously pointed revision (is_published=false,
 *     superseded_at), inserts the new revision, and updates the
 *     canonical pointer in one commit.
 *  3. Defensive unique index on (plan_version_id, period,
 *     amount_toman).
 *
 * Draft price revisions are mutable until published; once published
 * the CorePlanPrice model guard rejects further mutation, and
 * CorePlanVersion blocks pointer changes to already-published plan
 * versions.
 */
final class PlanPricePublisher
{
    public function __construct(private readonly AuditWriter $audit) {}

    /**
     * Create a new DRAFT price revision for a plan version. The
     * version must be a draft itself (published versions cannot
     * receive new prices — the caller creates a new version and
     * publishes it atomically with its prices).
     */
    public function createDraftPrice(
        CorePlanVersion $version,
        string $period,
        int $amountToman,
        User $actor,
    ): CorePlanPrice {
        $this->assertValidPeriod($period);
        $this->assertValidAmount($amountToman);

        return DB::transaction(function () use ($version, $period, $amountToman, $actor): CorePlanPrice {
            $locked = CorePlanVersion::query()
                ->whereKey($version->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->isPublished()) {
                throw new BillingDomainException(
                    'plan_version_published',
                    'Cannot add a price revision to a published plan version.',
                );
            }

            $price = CorePlanPrice::create([
                'plan_version_id' => $locked->id,
                'period' => $period,
                'amount_toman' => $amountToman,
                'is_published' => false,
                'superseded_at' => null,
                'published_at' => null,
                'created_by' => $actor->id,
            ]);

            $this->audit->record(
                $actor,
                'billing.price.draft_created',
                ['plan_version_id' => $locked->id, 'period' => $period, 'amount_toman' => $amountToman],
                'platform',
                null,
                'core_plan_prices',
                (int) $price->id,
            );

            return $price;
        });
    }

    /**
     * Atomically publish a set of prices on a plan version and
     * mark the version published. If the version is already
     * published, returns the existing pointers idempotently (the
     * originally-published set wins; republication does not
     * change amounts or history).
     *
     * @param  array<string, int>  $pricesByPeriod  period => amount_toman
     * @return array{version: CorePlanVersion, prices: array<string, CorePlanPrice>}
     */
    public function publishPrices(
        CorePlanVersion $version,
        array $pricesByPeriod,
        User $actor,
    ): array {
        foreach ($pricesByPeriod as $period => $amount) {
            $this->assertValidPeriod((string) $period);
            $this->assertValidAmount((int) $amount);
        }

        return DB::transaction(function () use ($version, $pricesByPeriod, $actor): array {
            // 1. Lock the stable plan-version row first (SPEC §3.2).
            $locked = CorePlanVersion::query()
                ->whereKey($version->id)
                ->lockForUpdate()
                ->firstOrFail();

            // Idempotent: if already published with the identical
            // pointer set, return it without emitting new rows.
            if ($locked->isPublished()) {
                return [
                    'version' => $locked->load(['publishedMonthlyPrice', 'publishedAnnualPrice']),
                    'prices' => $this->currentPrices($locked),
                ];
            }

            $now = now();
            $publishedPrices = [];
            $pointerUpdates = [];

            foreach ($pricesByPeriod as $period => $amountToman) {
                $amountToman = (int) $amountToman;

                // Insert the newly-published revision (not upserted;
                // each publication produces fresh history rows).
                $newPrice = CorePlanPrice::create([
                    'plan_version_id' => $locked->id,
                    'period' => (string) $period,
                    'amount_toman' => $amountToman,
                    'is_published' => true,
                    'superseded_at' => null,
                    'published_at' => $now,
                    'created_by' => $actor->id,
                ]);

                $publishedPrices[(string) $period] = $newPrice;
                $pointerColumn = $period === CorePlanPrice::PERIOD_MONTHLY
                    ? 'published_monthly_price_id'
                    : 'published_annual_price_id';
                $pointerUpdates[$pointerColumn] = (int) $newPrice->id;
            }

            // 2. Supersede previously pointed rows of matching
            // periods on the same plan version (defensive — a draft
            // version normally has none).
            foreach ($pointerUpdates as $column => $priceId) {
                $previousId = (int) $locked->{$column};
                if ($previousId > 0 && $previousId !== $priceId) {
                    CorePlanPrice::whereKey($previousId)->update([
                        'is_published' => false,
                        'superseded_at' => $now,
                    ]);
                }
            }

            // 3. Flip the canonical pointer (and the version's
            // published_at) in the same commit.
            $pointerUpdates['published_at'] = $now;
            $locked->forceFill($pointerUpdates)->save();

            $this->audit->record(
                $actor,
                'billing.prices.published',
                [
                    'plan_version_id' => $locked->id,
                    'plan_id' => (int) $locked->plan_id,
                    'prices' => array_map(
                        fn(CorePlanPrice $p): array => [
                            'id' => (int) $p->id,
                            'period' => $p->period,
                            'amount_toman' => (int) $p->amount_toman,
                        ],
                        $publishedPrices,
                    ),
                ],
                'platform',
                null,
                'core_plan_versions',
                (int) $locked->id,
            );

            return [
                'version' => $locked->load(['publishedMonthlyPrice', 'publishedAnnualPrice']),
                'prices' => $publishedPrices,
            ];
        });
    }

    /**
     * All draft (unpublished, unsuperseded) price revisions on a
     * plan version, ordered by creation time.
     *
     * @return Collection<int, CorePlanPrice>
     */
    public function draftPrices(CorePlanVersion $version): Collection
    {
        return CorePlanPrice::query()
            ->where('plan_version_id', $version->id)
            ->where('is_published', false)
            ->whereNull('superseded_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * Read-only resolution of the published price for a plan
     * version and period. Returns null when no price is published
     * for that period (e.g. annual not offered) — callers must
     * treat null as "period unavailable", never derive from the
     * other period (M2-D5=A).
     */
    public function publishedPrice(CorePlanVersion $version, string $period): ?CorePlanPrice
    {
        $this->assertValidPeriod($period);

        $column = $period === CorePlanPrice::PERIOD_MONTHLY
            ? 'published_monthly_price_id'
            : 'published_annual_price_id';

        $priceId = $version->{$column};

        return $priceId === null ? null : CorePlanPrice::find((int) $priceId);
    }

    /**
     * Resolve the currently published version of a plan and its
     * published prices. The plan must be active; returns null when
     * the plan has no published version.
     */
    public function currentCatalogEntry(CorePlan $plan): ?array
    {
        if ($plan->status !== CorePlan::STATUS_ACTIVE) {
            return null;
        }

        $version = $plan->versions()
            ->whereNotNull('published_at')
            ->orderByDesc('version')
            ->first();

        if ($version === null) {
            return null;
        }

        $version->load(['publishedMonthlyPrice', 'publishedAnnualPrice']);

        return [
            'plan' => $plan,
            'version' => $version,
            'monthly' => $version->publishedMonthlyPrice,
            'annual' => $version->publishedAnnualPrice,
        ];
    }

    /** @return array<string, CorePlanPrice> */
    private function currentPrices(CorePlanVersion $version): array
    {
        $prices = [];
        if ($version->publishedMonthlyPrice !== null) {
            $prices[CorePlanPrice::PERIOD_MONTHLY] = $version->publishedMonthlyPrice;
        }
        if ($version->publishedAnnualPrice !== null) {
            $prices[CorePlanPrice::PERIOD_ANNUAL] = $version->publishedAnnualPrice;
        }

        return $prices;
    }

    private function assertValidPeriod(string $period): void
    {
        if (! in_array($period, CorePlanPrice::PERIODS, true)) {
            throw new BillingDomainException(
                'price_period_invalid',
                "Billing period [{$period}] is not supported.",
            );
        }
    }

    private function assertValidAmount(int $amountToman): void
    {
        if ($amountToman < 0) {
            throw new BillingArithmeticException('money_negative', 'Price amounts must be non-negative.');
        }

        $cap = (int) config('billing.max_amount_toman', 9_000_000_000_000_000);
        if ($amountToman > $cap) {
            throw new BillingArithmeticException(
                'money_overflow',
                'Price amount exceeds the configured service-level maximum.',
            );
        }
    }
}
