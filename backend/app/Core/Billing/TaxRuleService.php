<?php

namespace App\Core\Billing;

use App\Core\Audit\AuditWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * C5-M2-S2 tax-rule administration and calculation.
 *
 * At most one rule may be active at any instant (Q3=A). Creating a
 * new active rule inside a transaction that locks the
 * `core_tax_rules` table deactivates any currently-active rule and
 * inserts the new one. Tax amount is computed with MoneyToman
 * round-half-up once per taxable line (SPEC §3.1).
 */
final class TaxRuleService
{
    public function __construct(private readonly AuditWriter $audit) {}

    /**
     * Create a new tax rule. If $activate is true, atomically
     * deactivates the current active rule in the same transaction.
     */
    public function createRule(
        string $label,
        int $rateBasisPoints,
        ?User $actor,
        bool $activate = false,
        ?CarbonImmutable $validFrom = null,
        ?CarbonImmutable $validUntil = null,
    ): CoreTaxRule {
        $this->assertValidRate($rateBasisPoints);
        $this->assertValidWindow($validFrom, $validUntil);

        return DB::transaction(function () use ($label, $rateBasisPoints, $actor, $activate, $validFrom, $validUntil): CoreTaxRule {
            if ($activate) {
                $this->deactivateAllActiveLocked($actor);
            }

            $rule = CoreTaxRule::create([
                'label' => $label,
                'rate_basis_points' => $rateBasisPoints,
                'is_active' => $activate,
                'valid_from' => $validFrom?->toDateTimeString(),
                'valid_until' => $validUntil?->toDateTimeString(),
                'created_by' => $actor?->id,
            ]);

            $this->audit->record(
                $actor,
                'billing.tax_rule.created',
                ['tax_rule_id' => (int) $rule->id, 'rate_basis_points' => $rateBasisPoints, 'activated' => $activate],
                'platform',
                null,
                'core_tax_rules',
                (int) $rule->id,
            );

            return $rule;
        });
    }

    /**
     * Activate an existing rule; deactivates all other active rules
     * in the same transaction. Inactive/expired rules may still be
     * activated (their validity window controls applicability).
     */
    public function activate(CoreTaxRule $rule, User $actor): CoreTaxRule
    {
        return DB::transaction(function () use ($rule, $actor): CoreTaxRule {
            $locked = CoreTaxRule::query()->lockForUpdate()->findOrFail($rule->id);
            if ($locked->is_active) {
                return $locked;
            }
            $this->deactivateAllActiveLocked($actor);
            $locked->forceFill([
                'is_active' => true,
                'deactivated_by' => null,
                'deactivated_at' => null,
            ])->save();

            $this->audit->record(
                $actor,
                'billing.tax_rule.activated',
                ['tax_rule_id' => (int) $locked->id, 'rate_basis_points' => (int) $locked->rate_basis_points],
                'platform',
                null,
                'core_tax_rules',
                (int) $locked->id,
            );

            return $locked;
        });
    }

    public function deactivate(CoreTaxRule $rule, User $actor): CoreTaxRule
    {
        return DB::transaction(function () use ($rule, $actor): CoreTaxRule {
            $locked = CoreTaxRule::query()->lockForUpdate()->findOrFail($rule->id);
            if (! $locked->is_active) {
                return $locked;
            }
            $locked->forceFill([
                'is_active' => false,
                'deactivated_by' => $actor->id,
                'deactivated_at' => now(),
            ])->save();

            $this->audit->record(
                $actor,
                'billing.tax_rule.deactivated',
                ['tax_rule_id' => (int) $locked->id],
                'platform',
                null,
                'core_tax_rules',
                (int) $locked->id,
            );

            return $locked;
        });
    }

    /**
     * Return the currently applicable tax rule at $at, or null when
     * no rule applies. Only one rule can be applicable because
     * create/activate serialize under lock.
     */
    public function activeRuleAt(?CarbonImmutable $at = null): ?CoreTaxRule
    {
        $at ??= CarbonImmutable::now();

        /** @var CoreTaxRule|null $rule */
        $rule = CoreTaxRule::query()
            ->where('is_active', true)
            ->where(function ($q) use ($at): void {
                $q->whereNull('valid_from')->orWhere('valid_from', '<=', $at);
            })
            ->where(function ($q) use ($at): void {
                $q->whereNull('valid_until')->orWhere('valid_until', '>', $at);
            })
            ->orderBy('id')
            ->first();

        return $rule;
    }

    /**
     * Compute tax amount on a taxable base, integer Toman.
     * Returns ['rate_basis_points' => int|null, 'amount_toman' => int, 'rule_id' => int|null].
     *
     * When no tax rule is active, tax is 0 — never throws.
     */
    public function calculateTax(int $taxableToman, ?CarbonImmutable $at = null): array
    {
        if ($taxableToman < 0) {
            throw new BillingArithmeticException('money_negative', 'Taxable amount must be non-negative.');
        }

        $rule = $this->activeRuleAt($at);
        if ($rule === null) {
            return ['rate_basis_points' => null, 'amount_toman' => 0, 'rule_id' => null];
        }

        return [
            'rate_basis_points' => (int) $rule->rate_basis_points,
            'amount_toman' => MoneyToman::of($taxableToman)->percentage((int) $rule->rate_basis_points)->toInt(),
            'rule_id' => (int) $rule->id,
        ];
    }

    private function deactivateAllActiveLocked(?User $actor): void
    {
        // Cross-engine serialization for the "at most one active"
        // invariant (Q3=A). Lock the sentinel row created by the
        // C5-M2-S3 audit migration (id=-1) FOR UPDATE before scanning
        // for active rows; this serializes all concurrent
        // create/activate calls inside their transactions (LOCK
        // TABLES is avoided because it implicitly commits any
        // in-progress transaction, breaking atomicity). On SQLite,
        // write transactions are already serialized by the engine,
        // but locking the sentinel keeps behavior uniform.
        $sentinelId = -1;
        DB::table('core_tax_rules')->where('id', $sentinelId)->lockForUpdate()->get();

        $active = CoreTaxRule::query()
            ->where('is_active', true)
            ->where('id', '!=', $sentinelId)
            ->lockForUpdate()
            ->get();
        foreach ($active as $rule) {
            $rule->forceFill([
                'is_active' => false,
                'deactivated_by' => $actor?->id,
                'deactivated_at' => now(),
            ])->save();
        }
    }

    private function assertValidRate(int $bp): void
    {
        if ($bp < 0 || $bp > MoneyToman::BASIS_POINTS_DENOMINATOR) {
            throw new BillingArithmeticException(
                'rate_out_of_range',
                'Tax rate must be an integer basis-point value in [0, 10000].',
            );
        }
    }

    private function assertValidWindow(?CarbonImmutable $from, ?CarbonImmutable $until): void
    {
        if ($from !== null && $until !== null && $until->lt($from)) {
            throw new BillingDomainException(
                'tax_window_invalid',
                'Tax rule valid_until must be on or after valid_from.',
            );
        }
    }
}
