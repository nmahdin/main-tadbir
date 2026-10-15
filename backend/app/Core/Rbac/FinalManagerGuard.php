<?php

namespace App\Core\Rbac;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\WorkspaceMembership;

/**
 * Last-manager invariants (ADR-0003 §6): an organization must keep at
 * least one eligible Organization Manager and a workspace at least one
 * eligible Workspace Manager. "Removing" includes ending or
 * deactivating the membership and demoting it to another role; every
 * such path funnels through this guard inside a transaction.
 */
final class FinalManagerGuard
{
    public function assertWorkspaceMembershipRetainsManager(WorkspaceMembership $membership): void
    {
        if (! $membership->isActive() || $membership->role_id === null) {
            return;
        }

        $managerRoleId = ScopedRole::where('workspace_id', $membership->workspace_id)
            ->where('key', RoleProvisioner::WORKSPACE_MANAGER_KEY)
            ->where('is_protected', true)
            ->value('id');

        if ($managerRoleId === null || (int) $membership->role_id !== (int) $managerRoleId) {
            return;
        }

        $otherManagers = WorkspaceMembership::where('workspace_id', $membership->workspace_id)
            ->where('role_id', $managerRoleId)
            ->where('status', MembershipStatus::Active->value)
            ->whereKeyNot($membership->id)
            ->exists();

        if (! $otherManagers) {
            throw new RbacValidationException('The final active Workspace Manager cannot be removed or demoted.');
        }
    }

    public function assertOrganizationMembershipRetainsManager(OrganizationMembership $membership): void
    {
        if (! $membership->isActive() || $membership->role_id === null) {
            return;
        }

        $managerRoleId = ScopedRole::where('organization_id', $membership->organization_id)
            ->where('key', RoleProvisioner::ORGANIZATION_MANAGER_KEY)
            ->where('is_protected', true)
            ->value('id');

        if ($managerRoleId === null || (int) $membership->role_id !== (int) $managerRoleId) {
            return;
        }

        $otherManagers = OrganizationMembership::where('organization_id', $membership->organization_id)
            ->where('role_id', $managerRoleId)
            ->where('status', MembershipStatus::Active->value)
            ->whereKeyNot($membership->id)
            ->exists();

        if (! $otherManagers) {
            throw new RbacValidationException('The final active Organization Manager cannot be removed or demoted.');
        }
    }
}
