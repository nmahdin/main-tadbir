<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoreFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_workspace_must_have_exactly_one_owner(): void
    {
        $user = User::factory()->create();
        $organization = Organization::factory()->create();

        $this->expectException(DomainException::class);
        Workspace::create([
            'name' => 'Both owners',
            'owner_user_id' => $user->id,
            'organization_id' => $organization->id,
        ]);
    }

    public function test_workspace_with_no_owner_is_rejected(): void
    {
        $this->expectException(DomainException::class);
        Workspace::create(['name' => 'No owner']);
    }

    public function test_personal_and_organizational_workspaces_are_distinguishable(): void
    {
        $personal = Workspace::factory()->personal()->create();
        $organizational = Workspace::factory()->organizational()->create();

        $this->assertTrue($personal->isPersonal());
        $this->assertFalse($personal->isOrganizational());
        $this->assertTrue($organizational->isOrganizational());
        $this->assertSame(1, Workspace::personal()->count());
        $this->assertSame(1, Workspace::organizational()->count());
    }

    public function test_default_personal_workspace_is_unique_per_user_at_database_level(): void
    {
        $user = User::factory()->create();
        Workspace::factory()->personal()->default()->create(['owner_user_id' => $user->id]);

        $this->expectException(QueryException::class);
        Workspace::factory()->personal()->default()->create(['owner_user_id' => $user->id]);
    }

    public function test_ensure_default_personal_workspace_is_idempotent(): void
    {
        $user = User::factory()->create();
        $provisioner = app(PersonalWorkspaceProvisioner::class);

        $first = $provisioner->ensureDefault($user);
        $second = $provisioner->ensureDefault($user);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, Workspace::personal()->where('owner_user_id', $user->id)->where('is_default', true)->count());
        $this->assertSame(1, WorkspaceMembership::where('workspace_id', $first->id)->where('user_id', $user->id)->count());
    }

    public function test_organization_creation_is_atomic_with_default_workspace_and_memberships(): void
    {
        $creator = User::factory()->create();

        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme Org');

        $this->assertSame(1, $organization->workspaces()->where('is_default', true)->count());
        $this->assertTrue($organization->memberships()->where('user_id', $creator->id)->where('status', 'active')->exists());

        $defaultWorkspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->assertTrue($defaultWorkspace->memberships()->where('user_id', $creator->id)->where('status', 'active')->exists());
        $this->assertNull($defaultWorkspace->owner_user_id);
    }

    public function test_organization_creation_rolls_back_on_failure(): void
    {
        $creator = User::factory()->create();
        Organization::factory()->create(['slug' => 'taken']);

        try {
            app(OrganizationProvisioner::class)->create($creator, 'Acme Org', 'taken');
            $this->fail('Expected the duplicate slug to fail.');
        } catch (QueryException) {
            $this->assertSame(1, Organization::count());
            $this->assertSame(0, Workspace::count());
            $this->assertSame(0, OrganizationMembership::count());
        }
    }

    public function test_organization_membership_alone_grants_no_workspace_access(): void
    {
        $creator = User::factory()->create();
        $member = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme Org');

        OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);

        $defaultWorkspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->assertFalse(
            $defaultWorkspace->memberships()->where('user_id', $member->id)->exists(),
            'Organization membership must not implicitly create workspace membership.'
        );

        $this->actingAs($member)
            ->getJson('/api/v1/core/workspaces/'.$defaultWorkspace->id)
            ->assertForbidden();
    }

    public function test_organization_member_cannot_enumerate_workspaces_through_organization_endpoints(): void
    {
        $creator = User::factory()->create();
        $member = User::factory()->create();
        $outsider = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme Org');

        OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);

        $defaultWorkspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        // Distinctive names: the provisioner initially names the default
        // workspace after the organization, which would make a
        // name-absence assertion meaningless.
        $defaultWorkspace->update(['name' => 'Default Workspace Qzx']);
        $extraWorkspace = Workspace::factory()->organizational()->create([
            'organization_id' => $organization->id,
            'name' => 'Restricted Workspace Qzx',
        ]);

        // Organization endpoints return organization-level data only; no
        // workspace collection may leak to a member who holds no
        // workspace membership (no org-admin privilege exists pre-03B).
        $index = $this->actingAs($member)->getJson('/api/v1/core/organizations')->assertOk();
        $index->assertJsonPath('data.0.id', $organization->id);
        $index->assertJsonMissingPath('data.0.workspaces');
        $this->assertStringNotContainsString($defaultWorkspace->name, $index->getContent());
        $this->assertStringNotContainsString($extraWorkspace->name, $index->getContent());

        $show = $this->actingAs($member)->getJson('/api/v1/core/organizations/'.$organization->id)->assertOk();
        $show->assertJsonMissingPath('data.workspaces');
        $this->assertStringNotContainsString($defaultWorkspace->name, $show->getContent());
        $this->assertStringNotContainsString($extraWorkspace->name, $show->getContent());

        $workspaceIds = collect($this->actingAs($member)->getJson('/api/v1/core/workspaces')->assertOk()->json('data'))
            ->pluck('id');
        $this->assertFalse($workspaceIds->contains($defaultWorkspace->id));
        $this->assertFalse($workspaceIds->contains($extraWorkspace->id));

        $this->actingAs($outsider)
            ->getJson('/api/v1/core/organizations/'.$organization->id)
            ->assertForbidden();
    }

    public function test_organization_creation_response_contains_no_workspace_collection(): void
    {
        $creator = User::factory()->create();

        $response = $this->actingAs($creator)
            ->postJson('/api/v1/core/organizations', ['name' => 'Acme Org'])
            ->assertCreated();
        $response->assertJsonMissingPath('data.workspaces');

        // The workspace provisioned alongside is reachable only through
        // the visibility-checked workspace endpoint (creator holds an
        // explicit workspace membership from provisioning).
        $organization = Organization::query()->firstOrFail();
        $defaultWorkspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        $this->actingAs($creator)
            ->getJson('/api/v1/core/workspaces/'.$defaultWorkspace->id)
            ->assertOk()
            ->assertJsonMissingPath('data.default_personal_owner_id')
            ->assertJsonMissingPath('data.default_organization_id');
    }

    public function test_membership_lifecycle_transitions_and_reactivation(): void
    {
        $membership = WorkspaceMembership::factory()->create();

        $membership->deactivate();
        $this->assertSame(MembershipStatus::Deactivated, $membership->status);
        $this->assertNotNull($membership->deactivated_at);

        $membership->reactivate();
        $this->assertSame(MembershipStatus::Active, $membership->status);
        $this->assertNull($membership->deactivated_at);

        $membership->end();
        $this->assertSame(MembershipStatus::Ended, $membership->status);
        $this->assertNotNull($membership->ended_at);
    }

    public function test_ended_membership_is_terminal_but_rejoin_creates_a_new_record(): void
    {
        $membership = OrganizationMembership::factory()->create();
        $membership->end();

        try {
            $membership->reactivate();
            $this->fail('Ended memberships must not reactivate.');
        } catch (DomainException) {
            $rejoined = OrganizationMembership::create([
                'organization_id' => $membership->organization_id,
                'user_id' => $membership->user_id,
                'status' => MembershipStatus::Active,
            ]);

            $this->assertNotSame($membership->id, $rejoined->id);
            $this->assertSame(2, OrganizationMembership::where('organization_id', $membership->organization_id)->where('user_id', $membership->user_id)->count());
        }
    }

    public function test_second_live_membership_for_same_pair_is_rejected_by_the_database(): void
    {
        $membership = WorkspaceMembership::factory()->create();

        $this->expectException(QueryException::class);
        WorkspaceMembership::create([
            'workspace_id' => $membership->workspace_id,
            'user_id' => $membership->user_id,
            'status' => MembershipStatus::Deactivated,
        ]);
    }

    public function test_deactivated_organization_membership_blocks_workspace_visibility(): void
    {
        $creator = User::factory()->create();
        $member = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme Org');
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        $orgMembership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);

        $this->actingAs($member)->getJson('/api/v1/core/workspaces/'.$workspace->id)->assertOk();

        $orgMembership->deactivate();

        $this->actingAs($member)->getJson('/api/v1/core/workspaces/'.$workspace->id)->assertForbidden();
    }

    public function test_legacy_global_role_behavior_is_unchanged(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/auth/me')->assertOk();
        $this->assertIsArray($user->permissionKeys());
    }
}
