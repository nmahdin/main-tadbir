<?php

namespace App\Core\Billing\Reconciliation;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * C5-M6 — A reconciliation finding (append-only except for status/resolution metadata).
 *
 * @property int $id
 * @property string $finding_type
 * @property string $subject_type payment|order|document|promotion|subscription
 * @property int $subject_id
 * @property string $severity info|warning|critical
 * @property string $status open|resolved
 * @property bool $safe_to_retry
 * @property array|null $evidence
 * @property CarbonImmutable|null $detected_at
 * @property CarbonImmutable|null $resolved_at
 * @property int|null $resolved_by_user_id
 * @property string|null $resolution_note
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
final class CoreBillingReconciliationFinding extends Model
{
    protected $table = 'core_billing_reconciliation_findings';

    protected $fillable = [
        'finding_type', 'subject_type', 'subject_id', 'severity', 'status',
        'safe_to_retry', 'message', 'evidence', 'owner_key',
        'related_payment_id', 'related_order_id', 'detected_run_id',
        'resolved_at', 'resolved_by_user_id', 'resolution_note',
    ];

    protected function casts(): array
    {
        return [
            'evidence' => 'array',
            'safe_to_retry' => 'bool',
            'detected_at' => 'datetime',
            'resolved_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_user_id');
    }
}
