<?php

namespace App\Core\Organizations;

use App\Core\Memberships\MembershipLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\FinalManagerGuard;
use App\Core\Rbac\ScopedRole;
use App\Models\User;
use Database\Factories\OrganizationMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * Independent organization membership. This relation alone never grants
 * access to any workspace's data (ADR-0003); an active workspace
 * membership is additionally required for organizational workspaces.
 * Stage 03B attaches the single organization-scoped role; ending the
 * membership clears it, removing the final active Organization Manager
 * is refused.
 */
class OrganizationMembership extends Model
{
    /** @use HasFactory<OrganizationMembershipFactory> */
    use HasFactory, MembershipLifecycle {
        deactivate as deactivateMembership;
        end as endMembership;
    }

    protected $fillable = [
        'organization_id', 'user_id', 'role_id', 'status',
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
        app(FinalManagerGuard::class)->assertOrganizationMembershipRetainsManager($this);

        return $this->deactivateMembership();
    }

    public function end(): static
    {
        return DB::transaction(function (): static {
            app(FinalManagerGuard::class)->assertOrganizationMembershipRetainsManager($this);

            $membership = $this->endMembership();
            $membership->forceFill(['role_id' => null])->save();

            return $membership;
        });
    }

    protected static function newFactory(): OrganizationMembershipFactory
    {
        return OrganizationMembershipFactory::new();
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
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
