<?php

namespace App\Core\Subscriptions;

use Illuminate\Database\Eloquent\Model;

/**
 * Recoverable pending Free-plan activation (C5-EXT-01 M1).
 * One row per subscription owner ('org:{id}' / 'ws:{id}'); resolved
 * rows are kept for audit/reporting, never deleted by the resume
 * command.
 */
final class FreeActivationPending extends Model
{
    protected $table = 'free_activation_pending';

    protected $fillable = [
        'owner_key', 'organization_id', 'personal_workspace_id',
        'user_id', 'reason_code', 'attempts', 'resolved_at',
    ];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
    }
}
