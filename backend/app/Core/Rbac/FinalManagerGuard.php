<?php

namespace App\Core\Rbac;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;

/**
 * Last-manager invariants (ADR-0003 §6): an organization must keep at
 * least one eligible Organization Manager and a workspace at least one
 * eligible Workspace Manager. "Removing" includes ending or
 * deactivating the membership and demoting it to another role.
 *
 * Concurrency contract: locking only the target membership is NOT
 * sufficient — two different managers of the same scope could be
 * removed concurrently and each check would still see the other. Every
 * transaction that can remove a manager therefore first locks the
 * scope container row (workspace or organization) FOR UPDATE via
 * lockWorkspaceScope()/lockOrganizationScope(), which serializes all
 * manager-removal decisions within that scope, and only then locks
 * and re-reads the membership/role rows (global lock order: scope row,
 * then membership/role row — no path takes them in the reverse order,
 * so the scheme cannot deadlock against itself). The assert* methods
 * assume the caller already holds the scope lock inside a transaction.
 *
 * Engine note (ADR-0009): MySQL/InnoDB honors SELECT ... FOR UPDATE
 * (proven by CoreRbacConcurrencyMysqlTest in CI). SQLite silently
 * ignores the lock clause; concurrent SQLite writers are serialized by
 * the database file lock instead, and SQLite is not a multi-writer
 * production engine for this system (production profile is MySQL).
 */
final class FinalManagerGuard
{
    public function lockWorkspaceScope(int $workspaceId): Workspace
    {
        return Workspace::whereKey($workspaceId)->lockForUpdate()->firstOrFail();
    }

    public function lockOrganizationScope(int $organizationId): Organization
    {
        return Organization::whereKey($organizationId)->lockForUpdate()->firstOrFail();
    }

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
