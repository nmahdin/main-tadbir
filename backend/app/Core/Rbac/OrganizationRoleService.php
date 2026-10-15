<?php

namespace App\Core\Rbac;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Organization-scoped role assignment (Stage 03B). Organization roles
 * govern the management plane only; assigning one never creates a
 * workspace membership and never yields workspace permissions
 * (ADR-0003). Grant ceiling, scope/container match, and final-manager
 * protection mirror the workspace service. Custom organization roles
 * are deferred (organization role templates are a later slice,
 * ADR-0004 §7 / Q-06); the protected defaults are seeded by
 * RoleProvisioner.
 */
final class OrganizationRoleService
{
    public function __construct(
        private readonly MembershipPermissions $permissions,
        private readonly FinalManagerGuard $finalManagerGuard,
    ) {}

    public function assignRole(User $actor, OrganizationMembership $membership, ScopedRole $role): OrganizationMembership
    {
        return DB::transaction(function () use ($actor, $membership, $role): OrganizationMembership {
            $membership = OrganizationMembership::whereKey($membership->id)->lockForUpdate()->firstOrFail();

            $this->assertAssignable($membership, $role);

            $actorKeys = $this->permissions->organizationPermissionKeys($actor, $membership->organization);
            if (! in_array('organization.roles.manage', $actorKeys, true)) {
                throw new RbacAuthorizationException('The actor lacks organization.roles.manage in this organization.');
            }

            GrantCeiling::assertWithinCeiling($actorKeys, $role->permissionKeys(), 'organization');

            if ((int) $membership->role_id !== (int) $role->id) {
                $this->finalManagerGuard->assertOrganizationMembershipRetainsManager($membership);
            }

            $membership->role_id = $role->id;
            $membership->save();

            return $membership->refresh();
        });
    }

    public function assignSystemRole(OrganizationMembership $membership, ScopedRole $role): OrganizationMembership
    {
        return DB::transaction(function () use ($membership, $role): OrganizationMembership {
            $membership = OrganizationMembership::whereKey($membership->id)->lockForUpdate()->firstOrFail();

            $this->assertAssignable($membership, $role);
            $membership->role_id = $role->id;
            $membership->save();

            return $membership->refresh();
        });
    }

    private function assertAssignable(OrganizationMembership $membership, ScopedRole $role): void
    {
        if ($membership->status === MembershipStatus::Ended) {
            throw new RbacValidationException('An ended membership cannot be assigned a role; rejoining creates a new membership.');
        }

        if (! $role->isOrganizationScoped() || (int) $role->organization_id !== (int) $membership->organization_id) {
            throw new RbacValidationException('Role scope or organization does not match the membership organization.');
        }
    }
}
