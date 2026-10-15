<?php

namespace App\Core\Organizations;

use App\Core\Memberships\MembershipLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Models\User;
use Database\Factories\OrganizationMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Independent organization membership. This relation alone never grants
 * access to any workspace's data (ADR-0003); an active workspace
 * membership is additionally required for organizational workspaces.
 */
class OrganizationMembership extends Model
{
    /** @use HasFactory<OrganizationMembershipFactory> */
    use HasFactory, MembershipLifecycle;

    protected $fillable = [
        'organization_id', 'user_id', 'status',
    ];

    protected function casts(): array
    {
        return [
            'status' => MembershipStatus::class,
            'deactivated_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
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
}
