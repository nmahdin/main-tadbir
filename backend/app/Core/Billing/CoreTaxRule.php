<?php

namespace App\Core\Billing;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * C5-M2-S2 configured itemized tax rule (M2-D3=A, Q3=A).
 *
 * At most one rule may be active at any instant; TaxRuleService
 * enforces this transactionally. Rates are integer basis points
 * (0–10000 = 0.00%–100.00%) applied once per order line per
 * SPEC-C5-M2 §3.1 (tax-exclusive, round-half-up).
 *
 * Rules are append-only from an audit perspective: deactivation sets
 * is_active=false plus deactivated_at/by; rows are never deleted.
 *
 * @property int $id
 * @property string $label
 * @property int $rate_basis_points
 * @property bool $is_active
 * @property Carbon|null $valid_from
 * @property Carbon|null $valid_until
 * @property int|null $created_by
 * @property int|null $deactivated_by
 * @property Carbon|null $deactivated_at
 */
class CoreTaxRule extends Model
{
    protected $table = 'core_tax_rules';

    protected $fillable = [
        'label',
        'rate_basis_points',
        'is_active',
        'valid_from',
        'valid_until',
        'created_by',
        'deactivated_by',
        'deactivated_at',
    ];

    protected function casts(): array
    {
        return [
            'rate_basis_points' => 'integer',
            'is_active' => 'boolean',
            'valid_from' => 'datetime',
            'valid_until' => 'datetime',
            'created_by' => 'integer',
            'deactivated_by' => 'integer',
            'deactivated_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function deactivator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deactivated_by');
    }

    public function isApplicableAt(Carbon $at): bool
    {
        if (! $this->is_active) {
            return false;
        }
        if ($this->valid_from !== null && $at->lt($this->valid_from)) {
            return false;
        }
        if ($this->valid_until !== null && $at->gte($this->valid_until)) {
            return false;
        }

        return true;
    }
}
