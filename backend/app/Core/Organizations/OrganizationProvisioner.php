<?php

namespace App\Core\Organizations;

use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Subscriptions\FreePlanActivator;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Creates an organization atomically (ADR-0002): the organization, its
 * one default organizational workspace, the creator's organization
 * membership and the creator's EXPLICIT workspace membership on that
 * default workspace. Stage 03B adds the scoped roles inside the same
 * transaction: the creator receives the protected Organization Manager
 * role (initial organization-management authority) and, explicitly
 * through the workspace membership, the Workspace Manager role of the
 * default workspace. Later organization members receive neither a
 * workspace membership nor a workspace role implicitly (ADR-0003).
 */
final class OrganizationProvisioner
{
    public function __construct(
        private readonly RoleProvisioner $roles,
        private readonly OrganizationRoleService $organizationRoles,
        private readonly WorkspaceRoleService $workspaceRoles,
        private readonly FreePlanActivator $freePlans,
    ) {}

    public function create(User $creator, string $name, ?string $slug = null): Organization
    {
        return DB::transaction(function () use ($creator, $name, $slug): Organization {
            $organization = Organization::create([
                'name' => $name,
                'slug' => $slug ?? $this->uniqueSlug($name),
                'status' => 'active',
                'created_by' => $creator->id,
            ]);

            $workspace = Workspace::create([
                'name' => $name,
                'organization_id' => $organization->id,
                'is_default' => true,
                'status' => 'active',
            ]);

            $organizationRoles = $this->roles->ensureForOrganization($organization);
            $organizationMembership = OrganizationMembership::create([
                'organization_id' => $organization->id,
                'user_id' => $creator->id,
                'status' => MembershipStatus::Active,
            ]);
            $this->organizationRoles->assignSystemRole($organizationMembership, $organizationRoles['manager']);

            $workspaceRoles = $this->roles->ensureForWorkspace($workspace);
            $workspaceMembership = WorkspaceMembership::create([
                'workspace_id' => $workspace->id,
                'user_id' => $creator->id,
                'status' => MembershipStatus::Active,
            ]);
            $this->workspaceRoles->assignSystemRole($workspaceMembership, $workspaceRoles['manager']);

            // C5-EXT-01 M1 / AMB-C5-03=B: Organization Free activates
            // automatically for eligible newly created organizations.
            // A missing published Free plan records a recoverable
            // pending state (free_activation_pending) — organization
            // creation itself never fails or claims false success,
            // and `subscriptions:resume-pending-free` completes it
            // later. An existing legitimate subscription is never
            // replaced (the activator classifies it as conflict).
            $this->freePlans->activateForOrganization($creator, $organization, 'org-creation-'.$organization->id);

            return $organization;
        });
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'organization';
        $slug = $base;
        $suffix = 2;

        while (Organization::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
