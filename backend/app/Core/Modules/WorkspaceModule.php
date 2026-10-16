<?php

namespace App\Core\Modules;

use App\Core\Workspaces\Workspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-workspace module activation state (Stage C4-1 schema;
 * mutations arrive with C4-2). Absence of a row means disabled —
 * rows are never created automatically at workspace creation.
 */
class WorkspaceModule extends Model
{
    public const STATUS_ENABLED = 'enabled';

    public const STATUS_DISABLED = 'disabled';

    protected $fillable = [
        'workspace_id', 'module_id', 'status',
        'enabled_at', 'enabled_by_user_id', 'disabled_at', 'disabled_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'enabled_at' => 'datetime',
            'disabled_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(CoreModule::class, 'module_id');
    }

    public function isEnabled(): bool
    {
        return $this->status === self::STATUS_ENABLED;
    }
}
