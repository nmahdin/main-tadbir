<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * UX-02-1 (K1): GET /core/environments is a read-only discovery
 * payload. It must mirror the existing C1–C3 visibility rules exactly
 * and grant nothing by itself.
 */
class EnvironmentDiscoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalog::sync();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/v1/core/environments')->assertUnauthorized();
    }

    public function test_user_without_any_context_gets_empty_environments(): void
    {
        $user = User::factory()->create(['status' => 'active']);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $response->assertJsonPath('data.platform.eligible', false);
        $response->assertJsonPath('data.platform.is_primary', false);
        $response->assertJsonPath('data.platform.permissions', []);
        $this->assertSame([], $response->json('data.organizations'));
        $this->assertSame([], $response->json('data.workspaces'));
    }

    public function test_active_organization_member_sees_organization_with_role_and_permissions(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $organization = Organization::factory()->create(['name' => 'Acme Org']);
        OrganizationMembership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
        ]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $items = $response->json('data.organizations');
        $this->assertCount(1, $items);
        $this->assertSame($organization->id, $items[0]['id']);
        $this->assertSame('Acme Org', $items[0]['name']);
        $this->assertSame('active', $items[0]['status']);
        $this->assertSame('organization_member', $items[0]['role']['key']);
        $this->assertContains('organization.view', $items[0]['permissions']);
        $this->assertNotContains('organization.manage', $items[0]['permissions']);
    }

    public function test_suspended_organization_and_deactivated_membership_are_hidden(): void
    {
        $user = User::factory()->create(['status' => 'active']);

        $suspended = Organization::factory()->create();
        OrganizationMembership::factory()->create([
            'organization_id' => $suspended->id,
            'user_id' => $user->id,
        ]);
        $suspended->forceFill(['status' => 'suspended'])->save();

        $deactivatedOrganization = Organization::factory()->create();
        OrganizationMembership::factory()->deactivated()->create([
            'organization_id' => $deactivatedOrganization->id,
            'user_id' => $user->id,
        ]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $this->assertSame([], $response->json('data.organizations'));
    }

    public function test_non_member_never_sees_the_organization(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        Organization::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $this->assertSame([], $response->json('data.organizations'));
    }

    public function test_personal_workspace_owner_is_listed_as_owner(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = Workspace::factory()->personal()->default()->create([
            'owner_user_id' => $user->id,
            'name' => 'My Workspace',
        ]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $items = $response->json('data.workspaces');
        $this->assertCount(1, $items);
        $this->assertSame($workspace->id, $items[0]['id']);
        $this->assertSame('owner', $items[0]['relation']);
        $this->assertNull($items[0]['organization_id']);
        $this->assertNull($items[0]['organization_name']);
        $this->assertTrue($items[0]['is_default']);
    }

    public function test_organizational_workspace_requires_both_memberships(): void
    {
        $member = User::factory()->create(['status' => 'active']);
        $workspaceOnly = User::factory()->create(['status' => 'active']);
        $organization = Organization::factory()->create(['name' => 'Holding Org']);
        $workspace = Workspace::factory()->organizational()->create([
            'organization_id' => $organization->id,
            'name' => 'Team Workspace',
        ]);

        OrganizationMembership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
        ]);
        WorkspaceMembership::factory()->create([
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
        ]);
        // Workspace membership without organization membership (C1/ADR-0003):
        // must NOT surface the workspace.
        WorkspaceMembership::factory()->create([
            'workspace_id' => $workspace->id,
            'user_id' => $workspaceOnly->id,
        ]);

        $memberItems = $this->actingAs($member)->getJson('/api/v1/core/environments')
            ->assertOk()->json('data.workspaces');
        $this->assertCount(1, $memberItems);
        $this->assertSame($workspace->id, $memberItems[0]['id']);
        $this->assertSame($organization->id, $memberItems[0]['organization_id']);
        $this->assertSame('Holding Org', $memberItems[0]['organization_name']);
        $this->assertSame('member', $memberItems[0]['relation']);
        $this->assertSame('member', $memberItems[0]['role']['key']);
        $this->assertContains('workspace.view', $memberItems[0]['permissions']);

        $outsiderItems = $this->actingAs($workspaceOnly)->getJson('/api/v1/core/environments')
            ->assertOk()->json('data.workspaces');
        $this->assertSame([], $outsiderItems);
    }

    public function test_workspace_of_suspended_organization_is_hidden(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $organization = Organization::factory()->create();
        $workspace = Workspace::factory()->organizational()->create([
            'organization_id' => $organization->id,
        ]);
        OrganizationMembership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
        ]);
        WorkspaceMembership::factory()->create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
        ]);

        $organization->forceFill(['status' => 'suspended'])->save();

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $this->assertSame([], $response->json('data.organizations'));
        $this->assertSame([], $response->json('data.workspaces'));
    }

    public function test_platform_assignment_makes_platform_environment_eligible(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $role = PlatformRole::create(['key' => 'env_probe', 'name' => 'Env Probe']);
        $role->permissions()->attach(
            ScopedPermission::whereIn('key', ['platform.users.view'])->pluck('id'),
        );
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $response->assertJsonPath('data.platform.eligible', true);
        $response->assertJsonPath('data.platform.is_primary', false);
        $this->assertContains('platform.users.view', $response->json('data.platform.permissions'));
    }

    public function test_primary_platform_administrator_is_flagged(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $role = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $response->assertJsonPath('data.platform.eligible', true);
        $response->assertJsonPath('data.platform.is_primary', true);
        $this->assertNotSame([], $response->json('data.platform.permissions'));
    }

    public function test_revoked_platform_assignment_is_not_eligible(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $role = PlatformRole::create(['key' => 'env_revoked', 'name' => 'Revoked']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => $role->id,
            'revoked_at' => now(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/v1/core/environments')->assertOk();

        $response->assertJsonPath('data.platform.eligible', false);
        $response->assertJsonPath('data.platform.permissions', []);
    }
}
