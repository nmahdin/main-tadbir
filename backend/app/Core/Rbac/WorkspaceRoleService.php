<?php

namespace App\Core\Rbac;

use App\Core\Memberships\MembershipStatus;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Workspace-scoped role administration (Stage 03B): assignment of the
 * membership's single role, plus custom role management. All rules live
 * here so endpoints never duplicate them:
 *  - role and membership must belong to the same workspace (cross-
 *    workspace assignment is rejected, never coerced);
 *  - the actor needs an active membership with workspace.roles.manage;
 *  - grant ceiling: the target role's permissions must be a subset of
 *    the actor's own effective workspace permissions;
 *  - protected roles (Workspace Manager, Member) cannot be created
 *    under their keys, edited, or deleted;
 *  - the final active Workspace Manager cannot be demoted;
 *  - ended memberships hold no role and cannot receive one (rejoining
 *    creates a new membership, which is then assigned explicitly).
 *
 * assignSystemRole() is the bootstrap path used by provisioners and
 * seeders (no actor yet exists); it applies the same scope/container
 * validation without actor authorization or ceiling checks.
 */
final class WorkspaceRoleService
{
    public function __construct(
        private readonly MembershipPermissions $permissions,
        private readonly FinalManagerGuard $finalManagerGuard,
        private readonly RoleProvisioner $roleProvisioner,
    ) {}

    public function assignRole(User $actor, WorkspaceMembership $membership, ScopedRole $role): WorkspaceMembership
    {
        return DB::transaction(function () use ($actor, $membership, $role): WorkspaceMembership {
            // Scope-level serialization first, then the membership row
            // (FinalManagerGuard lock-order contract).
            $workspace = $this->lockWorkspaceScope((int) $membership->workspace_id);
            $membership = WorkspaceMembership::whereKey($membership->id)->lockForUpdate()->firstOrFail();

            $this->assertAssignable($membership, $role);

            $actorKeys = $this->actorPermissionKeys($actor, $workspace);
            GrantCeiling::assertWithinCeiling($actorKeys, $role->permissionKeys(), 'workspace');

            if ((int) $membership->role_id !== (int) $role->id) {
                $this->finalManagerGuard->assertWorkspaceMembershipRetainsManager($membership);
            }

            $membership->role_id = $role->id;
            $membership->save();

            return $membership->refresh();
        });
    }

    public function assignSystemRole(WorkspaceMembership $membership, ScopedRole $role): WorkspaceMembership
    {
        return DB::transaction(function () use ($membership, $role): WorkspaceMembership {
            $this->lockWorkspaceScope((int) $membership->workspace_id);
            $membership = WorkspaceMembership::whereKey($membership->id)->lockForUpdate()->firstOrFail();

            $this->assertAssignable($membership, $role);
            $membership->role_id = $role->id;
            $membership->save();

            return $membership->refresh();
        });
    }

    /**
     * @param  list<string>  $permissionKeys
     */
    public function createCustomRole(User $actor, Workspace $workspace, string $name, array $permissionKeys, ?string $key = null): ScopedRole
    {
        // Atomic: the role row and its permission synchronization either
        // both commit or neither does, under the workspace scope lock so
        // concurrent role administration in this workspace serializes.
        return DB::transaction(function () use ($actor, $workspace, $name, $permissionKeys, $key): ScopedRole {
            $workspace = $this->lockWorkspaceScope((int) $workspace->id);

            $actorKeys = $this->actorPermissionKeys($actor, $workspace);
            PermissionCatalog::assertKnownKeysForScope($permissionKeys, PermissionCatalog::SCOPE_WORKSPACE);
            GrantCeiling::assertWithinCeiling($actorKeys, $permissionKeys, 'workspace');

            $key ??= Str::slug($name, '_');
            if (in_array($key, [RoleProvisioner::WORKSPACE_MANAGER_KEY, RoleProvisioner::WORKSPACE_MEMBER_KEY], true)) {
                throw new RbacValidationException("Role key [{$key}] is reserved for a protected default role.");
            }

            try {
                $role = ScopedRole::create([
                    'scope' => PermissionCatalog::SCOPE_WORKSPACE,
                    'workspace_id' => $workspace->id,
                    'key' => $key,
                    'name' => $name,
                    'is_protected' => false,
                ]);
            } catch (QueryException) {
                throw new RbacValidationException("A role with key [{$key}] already exists in this workspace.");
            }

            $this->syncPermissions($role, $permissionKeys);

            return $role->refresh();
        });
    }

    /**
     * @param  list<string>  $permissionKeys
     */
    public function updateCustomRolePermissions(User $actor, ScopedRole $role, array $permissionKeys): ScopedRole
    {
        // Atomic under the workspace scope lock and a role-row lock:
        // validation failures leave the previous permission set intact,
        // and a concurrent assignment observes only the before/after
        // state, never a half-synchronized pivot table.
        return DB::transaction(function () use ($actor, $role, $permissionKeys): ScopedRole {
            $workspace = $this->lockWorkspaceScope((int) $role->workspace_id);
            $role = ScopedRole::whereKey($role->id)->lockForUpdate()->firstOrFail();

            $this->assertCustomRoleOfWorkspace($role);
            $actorKeys = $this->actorPermissionKeys($actor, $workspace);
            PermissionCatalog::assertKnownKeysForScope($permissionKeys, PermissionCatalog::SCOPE_WORKSPACE);
            GrantCeiling::assertWithinCeiling($actorKeys, $permissionKeys, 'workspace');

            $this->syncPermissions($role, $permissionKeys);

            return $role->refresh();
        });
    }

    public function deleteCustomRole(User $actor, ScopedRole $role): void
    {
        // Atomic under the workspace scope lock: the in-use recheck and
        // the delete cannot interleave with a concurrent assignment of
        // this role (assignments take the same scope lock first).
        DB::transaction(function () use ($actor, $role): void {
            $workspace = $this->lockWorkspaceScope((int) $role->workspace_id);
            $role = ScopedRole::whereKey($role->id)->lockForUpdate()->firstOrFail();

            $this->assertCustomRoleOfWorkspace($role);
            $this->actorPermissionKeys($actor, $workspace);

            $inUse = WorkspaceMembership::where('role_id', $role->id)
                ->where('status', '!=', MembershipStatus::Ended->value)
                ->exists();
            if ($inUse) {
                throw new RbacValidationException('A role assigned to live memberships cannot be deleted.');
            }

            $role->delete();
        });
    }

    public function ensureDefaults(Workspace $workspace): void
    {
        $this->roleProvisioner->ensureForWorkspace($workspace);
    }

    /**
     * Workspace scope first (the established role-administration
     * lock), then the owning organization row for organizational
     * workspaces. Holding the organization lock while permissions
     * are re-read serializes role mutations against organization
     * suspension: a suspended organization commits first and the
     * mutation then observes the suspended state and fails closed,
     * or the mutation commits before suspension takes effect.
     */
    private function lockWorkspaceScope(int $workspaceId): Workspace
    {
        $workspace = $this->finalManagerGuard->lockWorkspaceScope($workspaceId);

        if ($workspace->isOrganizational()) {
            $this->finalManagerGuard->lockOrganizationScope((int) $workspace->organization_id);
            $workspace->load('organization');
        }

        return $workspace;
    }

    private function assertAssignable(WorkspaceMembership $membership, ScopedRole $role): void
    {
        if ($membership->status === MembershipStatus::Ended) {
            throw new RbacValidationException('An ended membership cannot be assigned a role; rejoining creates a new membership.');
        }

        if (! $role->isWorkspaceScoped() || (int) $role->workspace_id !== (int) $membership->workspace_id) {
            throw new RbacValidationException('Role scope or workspace does not match the membership workspace.');
        }
    }

    private function assertCustomRoleOfWorkspace(ScopedRole $role): void
    {
        if (! $role->isWorkspaceScoped() || $role->workspace === null) {
            throw new RbacValidationException('Role is not a workspace role.');
        }

        if ($role->isProtected()) {
            throw new RbacValidationException('Protected default roles cannot be modified or deleted.');
        }
    }

    /**
     * @return list<string>
     */
    private function actorPermissionKeys(User $actor, ?Workspace $workspace): array
    {
        if ($workspace === null) {
            throw new RbacAuthorizationException('Workspace not found for role administration.');
        }

        $keys = $this->permissions->workspacePermissionKeys($actor, $workspace);
        if (! in_array('workspace.roles.manage', $keys, true)) {
            throw new RbacAuthorizationException('The actor lacks workspace.roles.manage in this workspace.');
        }

        return $keys;
    }

    /**
     * @param  list<string>  $permissionKeys
     */
    private function syncPermissions(ScopedRole $role, array $permissionKeys): void
    {
        PermissionCatalog::sync();

        $permissionIds = ScopedPermission::whereIn('key', $permissionKeys)->pluck('id');
        $role->permissions()->sync($permissionIds);
    }
}
