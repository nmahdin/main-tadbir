<?php

namespace App\Core\Workspaces;

use App\Core\Memberships\MembershipLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\FinalManagerGuard;
use App\Core\Rbac\ScopedRole;
use App\Models\User;
use Database\Factories\WorkspaceMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * Independent workspace membership (Stage 03A) with its single
 * workspace-scoped role (Stage 03B, ADR-0004). The assignment services
 * guarantee every ACTIVE membership holds exactly one role belonging to
 * this membership's workspace; ending the membership clears the role so
 * rejoining never silently restores a previous role (ADR-0003).
 * Removing the final active Workspace Manager is refused here and in
 * the assignment service.
 */
class WorkspaceMembership extends Model
{
    /** @use HasFactory<WorkspaceMembershipFactory> */
    use HasFactory, MembershipLifecycle {
        deactivate as deactivateMembership;
        end as endMembership;
    }

    protected $fillable = [
        'workspace_id', 'user_id', 'role_id', 'status',
    ];

    protected function casts(): array
    {
        return [
            'status' => MembershipStatus::class,
            'deactivated_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function deactivate(): static
    {
        app(FinalManagerGuard::class)->assertWorkspaceMembershipRetainsManager($this);

        return $this->deactivateMembership();
    }

    public function end(): static
    {
        return DB::transaction(function (): static {
            app(FinalManagerGuard::class)->assertWorkspaceMembershipRetainsManager($this);

            $membership = $this->endMembership();
            $membership->forceFill(['role_id' => null])->save();

            return $membership;
        });
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

    public function role(): BelongsTo
    {
        return $this->belongsTo(ScopedRole::class, 'role_id');
    }
}
