<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Invitations\CoreInvitation;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-2: read-only dashboard summaries. Sections mirror the
 * permissions of their management surfaces and are null — never
 * fabricated zeros — when the caller lacks the permission.
 */
class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalog::sync();
    }

    /**
     * @param  list<string>|null  $permissionKeys  null = protected primary role
     */
    private function platformActor(?array $permissionKeys, string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);

        if ($permissionKeys === null) {
            $role = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        } else {
            $role = PlatformRole::create(['key' => 'ds_'.uniqid(), 'name' => 'DS']);
            $role->permissions()->attach(ScopedPermission::whereIn('key', $permissionKeys)->pluck('id'));
        }

        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        return $user;
    }

    public function test_platform_summary_requires_platform_assignment(): void
    {
        $this->getJson('/api/v1/core/platform/dashboard-summary')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create(['status' => 'active']));
        $this->getJson('/api/v1/core/platform/dashboard-summary')
            ->assertForbidden()
            ->assertJsonPath('code', 'platform_forbidden');
    }

    public function test_platform_summary_sections_follow_platform_permissions(): void
    {
        User::factory()->count(3)->create(['status' => 'active']);
        $viewer = $this->platformActor(['platform.users.view'], 'ds_users_viewer');

        Sanctum::actingAs($viewer);
        $response = $this->getJson('/api/v1/core/platform/dashboard-summary')->assertOk();

        $response->assertJsonPath('data.users.total', 4);
        // No organizations/subscriptions/audit permission: honest nulls.
        $this->assertNull($response->json('data.organizations'));
        $this->assertNull($response->json('data.subscriptions'));
        $this->assertNull($response->json('data.recent_activity'));
    }

    public function test_platform_summary_for_primary_administrator_counts_real_data(): void
    {
        $admin = $this->platformActor(null, 'ds_primary');

        $active = Organization::factory()->create(['status' => 'active']);
        Organization::factory()->create(['status' => 'suspended']);
        OrganizationMembership::factory()->create(['organization_id' => $active->id]);

        AuditLog::create([
            'actor_user_id' => $admin->id,
            'action' => 'organization.suspended',
            'scope_type' => 'platform',
            'scope_id' => null,
            'target_type' => 'organization',
            'target_id' => $active->id,
        ]);

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/core/platform/dashboard-summary')->assertOk();

        $response->assertJsonPath('data.organizations.total', 2);
        $response->assertJsonPath('data.organizations.active', 1);
        $response->assertJsonPath('data.organizations.suspended', 1);
        $response->assertJsonPath('data.organizations.without_subscription', 2);
        $response->assertJsonPath('data.subscriptions.total', 0);
        $this->assertSame('organization.suspended', $response->json('data.recent_activity.0.action'));
        $this->assertSame($admin->name, $response->json('data.recent_activity.0.actor_name'));
    }

    public function test_organization_summary_rejects_non_members_and_suspended_organizations(): void
    {
        $organization = Organization::factory()->create(['status' => 'active']);
        $outsider = User::factory()->create(['status' => 'active']);

        Sanctum::actingAs($outsider);
        $this->getJson("/api/v1/core/organizations/{$organization->id}/dashboard-summary")
            ->assertForbidden()
            ->assertJsonPath('code', 'organization_unavailable');

        $manager = User::factory()->create(['status' => 'active']);
        app(OrganizationProvisioner::class)->create($manager, 'Manager Org');
        $suspended = Organization::factory()->create(['status' => 'suspended']);
        OrganizationMembership::factory()->create(['organization_id' => $suspended->id, 'user_id' => $manager->id]);

        Sanctum::actingAs($manager);
        $this->getJson("/api/v1/core/organizations/{$suspended->id}/dashboard-summary")->assertForbidden();
    }

    public function test_organization_summary_for_plain_member_hides_management_sections(): void
    {
        $member = User::factory()->create(['status' => 'active']);
        $organization = Organization::factory()->create(['status' => 'active']);
        OrganizationMembership::factory()->create(['organization_id' => $organization->id, 'user_id' => $member->id]);

        Sanctum::actingAs($member);
        $response = $this->getJson("/api/v1/core/organizations/{$organization->id}/dashboard-summary")->assertOk();

        // organization.view only: counts of own organization + honest nulls.
        $response->assertJsonPath('data.workspaces.total', 0);
        $this->assertNull($response->json('data.members'));
        $this->assertNull($response->json('data.invitations'));
        $this->assertNull($response->json('data.recent_activity'));
        // Permitted to view the organization's own subscription: none
        // assigned yet is an honest "missing" state, not a null section.
        $response->assertJsonPath('data.subscription.state', 'missing');
    }

    public function test_organization_summary_for_manager_includes_members_invitations_activity_and_subscription(): void
    {
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('growth', 'Growth', 'organization');
        $plans->createDraftVersion('growth', 1, 7);
        $plans->setLimit('growth', 1, 'workspaces', 10);
        $plans->setLimit('growth', 1, 'organization_members', 5);
        $plans->publish('growth', 1);

        $manager = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($manager, 'Dashboard Org');
        OrganizationMembership::factory()->create(['organization_id' => $organization->id]);

        CoreInvitation::create([
            'type' => CoreInvitation::TYPE_ORGANIZATION,
            'organization_id' => $organization->id,
            'email_normalized' => 'pending@example.com',
            'token_hash' => hash('sha256', 'dashboard-token'),
            'status' => CoreInvitation::STATUS_PENDING,
            'intended_organization_role_id' => app(\App\Core\Rbac\RoleProvisioner::class)->organizationMember($organization)->id,
            'invited_by_user_id' => $manager->id,
            'expires_at' => now()->addDays(3),
        ]);
        AuditLog::create([
            'actor_user_id' => $manager->id,
            'action' => 'setting.value_written',
            'scope_type' => 'organization',
            'scope_id' => $organization->id,
            'target_type' => 'setting',
            'target_id' => null,
        ]);

        $admin = $this->platformActor(null, 'ds_sub_admin');
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/platform/organizations/{$organization->id}/subscription", [
            'plan_key' => 'growth',
            'plan_version' => 1,
            'starts_at' => '2026-05-01T00:00:00Z',
            'expires_at' => '2026-07-01T00:00:00Z',
            'reason' => 'dashboard test provisioning',
            'correlation_id' => 'dashboard-summary-1',
        ])->assertCreated();

        Sanctum::actingAs($manager);
        $response = $this->getJson("/api/v1/core/organizations/{$organization->id}/dashboard-summary")->assertOk();

        // Creator + one extra member are ACTIVE organization memberships.
        $response->assertJsonPath('data.members.active', 2);
        $response->assertJsonPath('data.invitations.pending', 1);
        $response->assertJsonPath('data.invitations.recent.0.email', 'pending@example.com');
        $response->assertJsonPath('data.subscription.state', 'active');
        $response->assertJsonPath('data.subscription.plan.key', 'growth');

        $limits = collect($response->json('data.subscription.limits'))->keyBy('resource_key');
        $this->assertSame(10, $limits['workspaces']['limit_value']);
        $this->assertSame(1, $limits['workspaces']['usage']);
        $this->assertSame(5, $limits['organization_members']['limit_value']);
        $this->assertSame(2, $limits['organization_members']['usage']);

        $this->assertSame('setting.value_written', $response->json('data.recent_activity.0.action'));
        $this->assertSame($manager->name, $response->json('data.recent_activity.0.actor_name'));
    }
}
