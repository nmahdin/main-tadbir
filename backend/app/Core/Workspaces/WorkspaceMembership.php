<?php

namespace App\Core\Workspaces;

use App\Core\Memberships\MembershipLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Models\User;
use Database\Factories\WorkspaceMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Independent workspace membership. The workspace-scoped role attaches to
 * this record in Stage 03B; Stage 03A intentionally has no role column.
 */
class WorkspaceMembership extends Model
{
    /** @use HasFactory<WorkspaceMembershipFactory> */
    use HasFactory, MembershipLifecycle;

    protected $fillable = [
        'workspace_id', 'user_id', 'status',
    ];

    protected function casts(): array
    {
        return [
            'status' => MembershipStatus::class,
            'deactivated_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    protected static function newFactory(): WorkspaceMembershipFactory
    {
        return WorkspaceMembershipFactory::new();
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
