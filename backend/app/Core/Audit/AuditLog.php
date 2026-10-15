<?php

namespace App\Core\Audit;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * One immutable security/domain audit event (Stage C1 foundation,
 * D-18). Distinct from the user-facing activity feed
 * (App\Models\ActivityLog): audit rows are append-only, written in
 * the same transaction as the mutation they record, and carry masked
 * summaries only — never credentials or token material.
 */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'audit_logs';

    protected $fillable = [
        'actor_user_id', 'action', 'scope_type', 'scope_id',
        'target_type', 'target_id', 'summary', 'ip_address', 'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'summary' => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn (): bool => throw new LogicException('Audit records are immutable.'));
        static::deleting(fn (): bool => throw new LogicException('Audit records are immutable.'));
    }
}
