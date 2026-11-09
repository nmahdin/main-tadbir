<?php

namespace App\Core\Authorization;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;

/**
 * A resolved, trusted workspace context (Stage 04A). Instances are
 * created only by WorkspaceContextResolver after every membership and
 * status check has passed; the snapshot carries the effective role
 * permission keys so downstream code never re-queries membership state
 * for the same decision. A fresh resolution is made per operation —
 * deactivated memberships and demotions take effect on the next call
 * (no cached grants).
 */
final readonly class WorkspaceContext
{
    /**
     * @param  list<string>  $permissionKeys
     */
    public function __construct(
        public User $user,
        public Workspace $workspace,
        public WorkspaceMembership $workspaceMembership,
        public ?OrganizationMembership $organizationMembership,
        public ?Organization $organization,
        public ?ScopedRole $role,
        public array $permissionKeys,
    ) {}

    public function hasPermission(string $permissionKey): bool
    {
        return in_array($permissionKey, $this->permissionKeys, true);
    }

    public function isOrganizational(): bool
    {
        return $this->workspace->isOrganizational();
    }

    public function workspaceId(): int
    {
        return (int) $this->workspace->id;
    }
}
