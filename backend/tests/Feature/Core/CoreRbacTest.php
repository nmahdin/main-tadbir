<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedRole;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoreRbacTest extends TestCase
{
    use RefreshDatabase;

    public function test_organization_creator_receives_manager_roles_and_full_scope_authority(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $permissions = app(MembershipPermissions::class);

        $organizationMembership = OrganizationMembership::where('organization_id', $organization->id)
            ->where('user_id', $creator->id)->firstOrFail();
        $workspaceMembership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $creator->id)->firstOrFail();

        $this->assertSame(RoleProvisioner::ORGANIZATION_MANAGER_KEY, $organizationMembership->role->key);
        $this->assertSame(RoleProvisioner::WORKSPACE_MANAGER_KEY, $workspaceMembership->role->key);
        // ARCH/C7-3: separately-provisioned secrets keys are NOT
        // part of the protected Manager grant (explicit contract).
        $this->assertEqualsCanonicalizing(
            PermissionCatalog::managerKeysForScope(PermissionCatalog::SCOPE_ORGANIZATION),
            $permissions->organizationPermissionKeys($creator, $organization),
        );
        $this->assertEqualsCanonicalizing(
            PermissionCatalog::managerKeysForScope(PermissionCatalog::SCOPE_WORKSPACE),
            $permissions->workspacePermissionKeys($creator, $workspace),
        );
    }

    public function test_protected_default_roles_are_idempotent_with_fixed_permissions(): void
    {
        $workspace = Workspace::factory()->personal()->create();
        $provisioner = app(RoleProvisioner::class);

        $first = $provisioner->ensureForWorkspace($workspace);
        $second = $provisioner->ensureForWorkspace($workspace);

        $this->assertSame($first['manager']->id, $second['manager']->id);
        $this->assertSame(2, ScopedRole::where('workspace_id', $workspace->id)->count());
        $this->assertTrue($first['manager']->isProtected());
        $this->assertSame(['workspace.view'], $first['member']->permissionKeys());
        $this->assertEqualsCanonicalizing(
            PermissionCatalog::managerKeysForScope(PermissionCatalog::SCOPE_WORKSPACE),
            $first['manager']->permissionKeys(),
        );

        $this->expectException(QueryException::class);
        ScopedRole::create([
            'scope' => PermissionCatalog::SCOPE_WORKSPACE,
            'workspace_id' => $workspace->id,
            'key' => RoleProvisioner::WORKSPACE_MANAGER_KEY,
            'name' => 'Duplicate manager',
        ]);
    }

    public function test_role_scope_container_mismatch_is_rejected(): void
    {
        $organization = Organization::factory()->create();
        $workspace = Workspace::factory()->personal()->create();

        try {
            ScopedRole::create([
                'scope' => PermissionCatalog::SCOPE_WORKSPACE,
                'organization_id' => $organization->id,
                'key' => 'wrong_container',
                'name' => 'Wrong container',
            ]);
            $this->fail('Expected a scope/container mismatch to be rejected.');
        } catch (DomainException) {
            $this->assertSame(0, ScopedRole::count());
        }

        $this->expectException(DomainException::class);
        ScopedRole::create([
            'scope' => PermissionCatalog::SCOPE_ORGANIZATION,
            'workspace_id' => $workspace->id,
            'key' => 'wrong_container',
            'name' => 'Wrong container',
        ]);
    }

    public function test_cross_workspace_role_assignment_is_denied(): void
    {
        $owner = User::factory()->create();
        $otherOwner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $otherWorkspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($otherOwner);

        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);
        $foreignRole = app(RoleProvisioner::class)->workspaceManager($otherWorkspace);

        $this->expectException(RbacValidationException::class);
        app(WorkspaceRoleService::class)->assignRole($owner, $membership, $foreignRole);
    }

    public function test_cross_scope_and_cross_organization_assignment_is_denied(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        [$otherOrganization] = $this->organizationContext('Other Org');
        $member = User::factory()->create();

        $organizationMembership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        $workspaceMembership = $this->addWorkspaceMembership($workspace, $member);
        $workspaceRole = app(RoleProvisioner::class)->workspaceMember($workspace);
        $foreignOrganizationRole = app(RoleProvisioner::class)->organizationManager($otherOrganization);

        try {
            app(WorkspaceRoleService::class)->assignRole($creator, $workspaceMembership, $foreignOrganizationRole);
            $this->fail('A foreign-container role must not be assignable.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        try {
            app(OrganizationRoleService::class)->assignRole($creator, $organizationMembership, $workspaceRole);
            $this->fail('A workspace role must not be assignable to an organization membership.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $this->expectException(RbacValidationException::class);
        app(OrganizationRoleService::class)->assignRole($creator, $organizationMembership, $foreignOrganizationRole);
    }

    public function test_custom_role_rejects_unknown_and_cross_scope_permission_keys(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $service = app(WorkspaceRoleService::class);

        try {
            $service->createCustomRole($owner, $workspace, 'Broken', ['workspace.view', 'workspace.fly']);
            $this->fail('Unknown permission keys must be rejected.');
        } catch (RbacValidationException $e) {
            $this->assertStringContainsString('workspace.fly', $e->getMessage());
        }

        $this->expectException(RbacValidationException::class);
        $service->createCustomRole($owner, $workspace, 'Wrong scope', ['organization.view']);
    }

    public function test_actor_without_roles_manage_can_neither_create_nor_assign_roles(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);
        $memberRole = app(RoleProvisioner::class)->workspaceMember($workspace);

        try {
            app(WorkspaceRoleService::class)->createCustomRole($member, $workspace, 'Nope', ['workspace.view']);
            $this->fail('A plain member must not create roles.');
        } catch (RbacAuthorizationException) {
            $this->assertTrue(true);
        }

        $this->actingAs($member)
            ->putJson("/api/v1/core/workspaces/{$workspace->id}/memberships/{$membership->id}/role", [
                'role_id' => $memberRole->id,
            ])
            ->assertForbidden();
    }

    public function test_grant_ceiling_blocks_privilege_escalation(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $service = app(WorkspaceRoleService::class);

        $leadRole = $service->createCustomRole($owner, $workspace, 'Team Lead', ['workspace.view', 'workspace.roles.manage']);
        $lead = User::factory()->create();
        $leadMembership = $this->addWorkspaceMembership($workspace, $lead);
        $service->assignRole($owner, $leadMembership, $leadRole);

        try {
            $service->createCustomRole($lead, $workspace, 'Escalated', ['workspace.members.manage']);
            $this->fail('Creating a role above the actor ceiling must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $managerRole = app(RoleProvisioner::class)->workspaceManager($workspace);
        try {
            $service->assignRole($lead, $leadMembership, $managerRole);
            $this->fail('Assigning a role above the actor ceiling must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $subset = $service->createCustomRole($lead, $workspace, 'Viewer Plus', ['workspace.view']);
        $this->assertSame(['workspace.view'], $subset->permissionKeys());
    }

    public function test_final_workspace_manager_cannot_be_demoted_deactivated_or_ended(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $membership = WorkspaceMembership::where('workspace_id', $workspace->id)->firstOrFail();
        $memberRole = app(RoleProvisioner::class)->workspaceMember($workspace);
        $service = app(WorkspaceRoleService::class);

        try {
            $service->assignRole($owner, $membership, $memberRole);
            $this->fail('Demoting the final Workspace Manager must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        try {
            $membership->deactivate();
            $this->fail('Deactivating the final Workspace Manager must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        try {
            $membership->end();
            $this->fail('Ending the final Workspace Manager must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $secondManager = User::factory()->create();
        $secondMembership = $this->addWorkspaceMembership($workspace, $secondManager);
        $managerRole = app(RoleProvisioner::class)->workspaceManager($workspace);
        $service->assignRole($owner, $secondMembership, $managerRole);

        $service->assignRole($owner, $membership->refresh(), $memberRole);
        $this->assertSame($memberRole->id, $membership->refresh()->role_id);
    }

    public function test_final_organization_manager_is_protected(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $membership = OrganizationMembership::where('organization_id', $organization->id)
            ->where('user_id', $creator->id)->firstOrFail();

        try {
            $membership->end();
            $this->fail('Ending the final Organization Manager must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $memberRole = app(RoleProvisioner::class)->organizationMember($organization);
        $this->expectException(RbacValidationException::class);
        app(OrganizationRoleService::class)->assignRole($creator, $membership, $memberRole);
    }

    public function test_inactive_memberships_cannot_exercise_permissions_or_receive_roles(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $permissions = app(MembershipPermissions::class);

        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);
        $this->assertNotEmpty($permissions->workspacePermissionKeys($member, $workspace));

        $membership->deactivate();
        $this->assertSame([], $permissions->workspacePermissionKeys($member, $workspace));
        $this->assertFalse($permissions->userHasWorkspacePermission($member, $workspace, 'workspace.view'));

        $membership->end();
        $this->assertNull($membership->refresh()->role_id);

        $memberRole = app(RoleProvisioner::class)->workspaceMember($workspace);
        $this->expectException(RbacValidationException::class);
        app(WorkspaceRoleService::class)->assignSystemRole($membership, $memberRole);
    }

    public function test_deactivated_organization_membership_blocks_workspace_permissions(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create();

        $organizationMembership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        $this->addWorkspaceMembership($workspace, $member);
        $permissions = app(MembershipPermissions::class);
        $this->assertNotEmpty($permissions->workspacePermissionKeys($member, $workspace));

        $organizationMembership->deactivate();
        $this->assertSame([], $permissions->workspacePermissionKeys($member, $workspace));
    }

    public function test_organization_manager_without_workspace_membership_has_no_workspace_authority(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $manager = User::factory()->create();

        $membership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $manager->id,
            'status' => MembershipStatus::Active,
        ]);
        app(OrganizationRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->organizationManager($organization),
        );

        $permissions = app(MembershipPermissions::class);
        $this->assertTrue($permissions->userHasOrganizationPermission($manager, $organization, 'organization.manage'));
        $this->assertSame([], $permissions->workspacePermissionKeys($manager, $workspace));

        $this->actingAs($manager)
            ->getJson('/api/v1/core/workspaces/'.$workspace->id)
            ->assertForbidden();
    }

    public function test_protected_roles_cannot_be_modified_deleted_or_shadowed(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $service = app(WorkspaceRoleService::class);
        $managerRole = app(RoleProvisioner::class)->workspaceManager($workspace);

        try {
            $service->updateCustomRolePermissions($owner, $managerRole, ['workspace.view']);
            $this->fail('Protected roles must not be edited.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        try {
            $service->deleteCustomRole($owner, $managerRole);
            $this->fail('Protected roles must not be deleted.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $this->expectException(RbacValidationException::class);
        $service->createCustomRole($owner, $workspace, 'Workspace Manager', ['workspace.view'], RoleProvisioner::WORKSPACE_MANAGER_KEY);
    }

    public function test_repeated_assignment_replaces_the_single_role(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $service = app(WorkspaceRoleService::class);
        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);

        $custom = $service->createCustomRole($owner, $workspace, 'Reviewer', ['workspace.view']);
        $memberRole = app(RoleProvisioner::class)->workspaceMember($workspace);

        $service->assignRole($owner, $membership, $custom);
        $service->assignRole($owner, $membership, $custom);
        $service->assignRole($owner, $membership->refresh(), $memberRole);

        $this->assertSame($memberRole->id, $membership->refresh()->role_id);
        $this->assertSame(1, WorkspaceMembership::where('workspace_id', $workspace->id)->where('user_id', $member->id)->count());
    }

    public function test_role_administration_api_enforces_authorization_and_validation(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);

        $this->actingAs($creator)
            ->postJson("/api/v1/core/workspaces/{$workspace->id}/roles", [
                'name' => 'Reviewer',
                'permissions' => ['workspace.view', 'workspace.roles.view'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.key', 'reviewer');

        $this->actingAs($creator)
            ->postJson("/api/v1/core/workspaces/{$workspace->id}/roles", [
                'name' => 'Broken',
                'permissions' => ['workspace.unknown'],
            ])
            ->assertUnprocessable();

        $memberRole = app(RoleProvisioner::class)->workspaceMember($workspace);
        $this->actingAs($creator)
            ->putJson("/api/v1/core/workspaces/{$workspace->id}/memberships/{$membership->id}/role", [
                'role_id' => $memberRole->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.role_id', $memberRole->id);

        $foreignWorkspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault(User::factory()->create());
        $foreignRole = app(RoleProvisioner::class)->workspaceManager($foreignWorkspace);
        $this->actingAs($creator)
            ->putJson("/api/v1/core/workspaces/{$workspace->id}/memberships/{$membership->id}/role", [
                'role_id' => $foreignRole->id,
            ])
            ->assertUnprocessable();

        $this->actingAs($creator)
            ->getJson("/api/v1/core/workspaces/{$workspace->id}/roles")
            ->assertOk();

        $this->actingAs($member)
            ->getJson("/api/v1/core/workspaces/{$workspace->id}/roles")
            ->assertForbidden();
    }

    public function test_removing_one_of_two_managers_succeeds_but_the_final_one_is_still_protected(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $ownerMembership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $owner->id)->firstOrFail();

        $secondManager = User::factory()->create();
        $secondMembership = $this->addWorkspaceMembership($workspace, $secondManager);
        app(WorkspaceRoleService::class)->assignRole(
            $owner,
            $secondMembership,
            app(RoleProvisioner::class)->workspaceManager($workspace),
        );

        // Simulates the loser of a concurrent-removal race: after the
        // first removal commits, the same operation on the remaining
        // manager must still be refused (scope-lock serialization makes
        // the check observe the committed outcome, see the MySQL
        // concurrency tests for the locking proof).
        $secondMembership->end();
        $this->assertSame(MembershipStatus::Ended, $secondMembership->refresh()->status);

        try {
            $ownerMembership->end();
            $this->fail('Ending the final Workspace Manager must be rejected.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        $this->expectException(RbacValidationException::class);
        $ownerMembership->deactivate();
    }

    public function test_failed_custom_role_writes_leave_no_partial_state(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $service = app(WorkspaceRoleService::class);

        try {
            $service->createCustomRole($owner, $workspace, 'Ghost', ['workspace.view', 'workspace.ghost']);
            $this->fail('Unknown keys must abort role creation.');
        } catch (RbacValidationException) {
            $this->assertSame(0, ScopedRole::where('workspace_id', $workspace->id)->where('name', 'Ghost')->count());
        }

        $role = $service->createCustomRole($owner, $workspace, 'Reviewer', ['workspace.view']);

        try {
            $service->updateCustomRolePermissions($owner, $role, ['workspace.view', 'workspace.ghost']);
            $this->fail('Unknown keys must abort the permission update.');
        } catch (RbacValidationException) {
            $this->assertSame(['workspace.view'], $role->refresh()->permissionKeys());
        }

        try {
            $service->createCustomRole($owner, $workspace, 'Reviewer Clone', ['workspace.view'], 'reviewer');
            $this->fail('Duplicate role keys must be rejected.');
        } catch (RbacValidationException) {
            $this->assertSame(
                ['workspace.view'],
                ScopedRole::where('workspace_id', $workspace->id)->where('key', 'reviewer')->firstOrFail()->permissionKeys(),
            );
        }
    }

    public function test_factory_memberships_hold_member_roles_and_ended_ones_hold_none(): void
    {
        $workspaceMembership = WorkspaceMembership::factory()->create();
        $this->assertSame(RoleProvisioner::WORKSPACE_MEMBER_KEY, $workspaceMembership->role->key);

        $organizationMembership = OrganizationMembership::factory()->create();
        $this->assertSame(RoleProvisioner::ORGANIZATION_MEMBER_KEY, $organizationMembership->role->key);

        $ended = WorkspaceMembership::factory()->ended()->create();
        $this->assertNull($ended->role_id);
    }

    /**
     * @return array{0: Organization, 1: Workspace, 2: User}
     */
    private function organizationContext(string $name = 'Acme Org'): array
    {
        $creator = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, $name);
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$organization, $workspace, $creator];
    }

    private function addWorkspaceMembership(Workspace $workspace, User $user): WorkspaceMembership
    {
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
            'status' => MembershipStatus::Active,
        ]);

        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        return $membership->refresh();
    }
}
