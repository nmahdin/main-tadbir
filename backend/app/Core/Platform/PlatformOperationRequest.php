<?php

namespace App\Core\Platform;

use Illuminate\Database\Eloquent\Model;

/**
 * Tracking record for a signed bootstrap/recovery operation
 * request (Stage C2-4). A `consumed` row is written inside the
 * operation transaction (replay barrier via the unique
 * request_id); `rejected` rows are best-effort diagnostics written
 * separately and never contain secret material.
 */
class PlatformOperationRequest extends Model
{
    protected $fillable = [
        'request_id', 'operation', 'operator_id', 'target_user_id',
        'incident_id', 'status', 'failure_code', 'consumed_at',
    ];

    protected function casts(): array
    {
        return [
            'consumed_at' => 'datetime',
        ];
    }
}
