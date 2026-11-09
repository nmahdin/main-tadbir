<?php

namespace Database\Seeders;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Stage 03B RBAC seeder (opt-in, NOT part of DatabaseSeeder so existing
 * seed behavior is unchanged).
 *
 *  1. Materializes the PermissionCatalog into core_permissions.
 *  2. Ensures the protected default roles of every existing
 *     organization and workspace.
 *  3. Backfills a role for live memberships that have none: personal
 *     workspace owners and organization creators (organizations.
 *     created_by) receive the manager role of their default scope,
 *     everyone else the member role. Membership/role rows created by
 *     the Stage 03B provisioners already carry roles and are skipped.
 *
 * Idempotent: re-running changes nothing.
 *
 *   php artisan db:seed --class=CoreRbacSeeder
 */
class CoreRbacSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            PermissionCatalog::sync();

            // Stage C2-1: provision the protected primary platform
            // role definition (never assigned to any user here).
            app(\App\Core\Platform\PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();

            $provisioner = app(RoleProvisioner::class);
            $workspaceRoles = app(WorkspaceRoleService::class);
            $organizationRoles = app(OrganizationRoleService::class);

            Organization::query()->each(function (Organization $organization) use ($provisioner, $organizationRoles): void {
                $roles = $provisioner->ensureForOrganization($organization);

                OrganizationMembership::where('organization_id', $organization->id)
                    ->whereIn('status', [MembershipStatus::Active->value, MembershipStatus::Deactivated->value])
                    ->whereNull('role_id')
                    ->each(function (OrganizationMembership $membership) use ($organization, $roles, $organizationRoles): void {
                        $isCreator = (int) $organization->created_by === (int) $membership->user_id;
                        $organizationRoles->assignSystemRole($membership, $isCreator ? $roles['manager'] : $roles['member']);
                    });
            });

            Workspace::query()->each(function (Workspace $workspace) use ($provisioner, $workspaceRoles): void {
                $roles = $provisioner->ensureForWorkspace($workspace);

                WorkspaceMembership::where('workspace_id', $workspace->id)
                    ->whereIn('status', [MembershipStatus::Active->value, MembershipStatus::Deactivated->value])
                    ->whereNull('role_id')
                    ->each(function (WorkspaceMembership $membership) use ($workspace, $roles, $workspaceRoles): void {
                        $isOwner = $workspace->isPersonal() && (int) $workspace->owner_user_id === (int) $membership->user_id;
                        $workspaceRoles->assignSystemRole($membership, $isOwner ? $roles['manager'] : $roles['member']);
                    });
            });
        });
    }
}
