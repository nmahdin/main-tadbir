<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\OrganizationModulePolicy;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C4-3 — workspace module management APIs over the C4-2
 * services. Successful activations inject an explicit entitlement
 * double; the production default stays fail-closed and is asserted
 * as such through the API.
 */
class WorkspaceModuleApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        [, $workspace] = $this->personalWorkspace();

        $this->getJson($this->modulesUrl($workspace))->assertUnauthorized();
        $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->assertUnauthorized();
    }

    public function test_manager_and_member_can_list_modules_disabled_by_default(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $member = $this->addMember($workspace);

        foreach ([$owner, $member] as $actor) {
            Sanctum::actingAs($actor);
            $response = $this->getJson($this->modulesUrl($workspace))->assertOk();
            $data = $response->json('data');
            $this->assertCount(22, $data);

            $byKey = collect($data)->keyBy('key');
            // Only the implemented Projects pilot is available, and
            // it is disabled + unentitled by default (production
            // entitlement gate fails closed — nothing is eligible).
            $this->assertTrue($byKey['projects']['available']);
            $this->assertSame('disabled', $byKey['projects']['state']);
            $this->assertFalse($byKey['projects']['eligible']);
            $this->assertSame(['entitlement_missing'], collect($byKey['projects']['blocking_reasons'])->pluck('code')->all());
            $this->assertFalse($byKey['tasks']['available']);
            $this->assertSame(
                ['calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows'],
                collect($byKey['events']['prerequisites'])->sort()->values()->all(),
            );
        }
    }

    public function test_listing_and_management_deny_non_members_platform_admins_and_foreign_managers(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        [$foreignManager] = $this->personalWorkspace();
        $outsider = User::factory()->create(['status' => 'active']);

        $platformAdmin = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $platformAdmin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        foreach ([$outsider, $foreignManager, $platformAdmin] as $actor) {
            Sanctum::actingAs($actor);
            $this->getJson($this->modulesUrl($workspace))->assertForbidden();
            $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->assertForbidden();
            $this->postJson($this->modulesUrl($workspace).'/projects/deactivate')->assertForbidden();
        }

        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/core/workspaces/999999/modules')->assertNotFound();
    }

    public function test_member_cannot_preview_activate_or_deactivate(): void
    {
        [, $workspace] = $this->personalWorkspace();
        $member = $this->addMember($workspace);
        $this->entitle(['projects']);

        Sanctum::actingAs($member);
        $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->assertForbidden();
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', ['confirmation_token' => 'x'])->assertForbidden();
        $this->postJson($this->modulesUrl($workspace).'/projects/deactivate')->assertForbidden();
    }

    public function test_preview_is_read_only_and_confirmed_activation_is_idempotent(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);
        Sanctum::actingAs($owner);

        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')
            ->assertOk()
            ->assertJsonPath('data.confirmable', true)
            ->assertJsonPath('data.to_enable', ['projects'])
            ->json('data');
        $this->assertSame(0, WorkspaceModule::count(), 'Preview must not mutate state.');

        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])
            ->assertOk()
            ->assertJsonPath('data.newly_enabled', ['projects'])
            ->assertJsonPath('data.state', 'enabled');
        $this->assertSame(1, WorkspaceModule::count());

        // Replaying the consumed token: state drifted, so it is
        // stale — rejected 409 and changes nothing.
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'module_activation_preview_stale');
        $this->assertSame(1, WorkspaceModule::count());

        // A fresh preview confirms as a safe no-op.
        $fresh = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')
            ->assertOk()
            ->assertJsonPath('data.already_enabled', ['projects'])
            ->json('data');
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $fresh['confirmation_token'],
        ])
            ->assertOk()
            ->assertJsonPath('data.newly_enabled', []);
        $this->assertSame(1, WorkspaceModule::count());
    }

    public function test_activation_fails_closed_without_entitlement_and_with_stale_or_missing_token(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        Sanctum::actingAs($owner);

        // No entitlement double: the production default denies.
        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')
            ->assertOk()
            ->assertJsonPath('data.confirmable', false)
            ->json('data');
        $this->assertSame(['entitlement_missing'], collect($preview['blocking_reasons'])->pluck('code')->all());

        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'entitlement_missing');

        // Missing token is a plain validation error.
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [])->assertUnprocessable();

        // Stale token: state changes between preview and confirm.
        $this->entitle(['projects']);
        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->json('data');
        $this->forceEnable($workspace, 'projects', $owner);
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'module_activation_preview_stale');
    }

    public function test_transitive_preview_and_unknown_module_contracts(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        Sanctum::actingAs($owner);

        $preview = $this->postJson($this->modulesUrl($workspace).'/events/activation-preview')
            ->assertOk()
            ->json('data');
        $this->assertSame(
            ['calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows'],
            collect($preview['prerequisites'])->sort()->values()->all(),
        );
        $this->assertSame('events', $preview['activation_order'][array_key_last($preview['activation_order'])]);
        $this->assertFalse($preview['confirmable']);
        $this->assertContains('module_unavailable', collect($preview['blocking_reasons'])->pluck('code')->all());

        $this->postJson($this->modulesUrl($workspace).'/not-a-module/activation-preview')
            ->assertNotFound()
            ->assertJsonPath('code', 'module_unknown');
        $this->postJson($this->modulesUrl($workspace).'/not-a-module/deactivate')
            ->assertNotFound()
            ->assertJsonPath('code', 'module_unknown');
    }

    public function test_deactivation_conflict_exposes_dependents_and_preserves_data(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);
        Sanctum::actingAs($owner);

        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->json('data');
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])->assertOk();

        $project = Project::create(['name' => 'Keep me', 'status' => 'active', 'workspace_id' => $workspace->id]);
        $this->forceEnable($workspace, 'surveys', $owner);

        $this->postJson($this->modulesUrl($workspace).'/forms/deactivate')
            ->assertStatus(409)
            ->assertJsonPath('code', 'module_has_active_dependents')
            ->assertJsonPath('dependents', ['surveys']);

        $this->postJson($this->modulesUrl($workspace).'/projects/deactivate')
            ->assertOk()
            ->assertJsonPath('data.state', 'disabled');
        $this->assertDatabaseHas('projects', ['id' => $project->id, 'workspace_id' => $workspace->id]);
    }

    public function test_suspended_organization_and_explicit_deny_block_module_management(): void
    {
        [$creator, $organization, $workspace] = $this->organizationWorkspace();
        $this->entitle(['projects']);
        Sanctum::actingAs($creator);

        OrganizationModulePolicy::create([
            'organization_id' => $organization->id,
            'module_id' => CoreModule::query()->where('key', 'projects')->sole()->id,
            'policy' => OrganizationModulePolicy::POLICY_DENIED,
        ]);

        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')
            ->assertOk()
            ->json('data');
        $this->assertSame(['organization_policy_denied'], collect($preview['blocking_reasons'])->pluck('code')->all());
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'organization_policy_denied');

        // Suspension denies every module endpoint generically.
        $organization->forceFill(['status' => 'suspended'])->save();
        $this->getJson($this->modulesUrl($workspace))
            ->assertForbidden()
            ->assertJsonPath('code', 'organization_unavailable');
        $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->assertForbidden();
        $this->postJson($this->modulesUrl($workspace).'/projects/deactivate')->assertForbidden();
        $this->assertSame(0, WorkspaceModule::count());
    }

    public function test_api_activation_drives_projects_pilot_access(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        // Real C5-3 path (pilot config retired): an active entitled
        // subscription makes API activation confirmable and scoped
        // Projects access operational.
        $this->subscribePersonal($workspace);
        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/projects', [
            'name' => 'Blocked', 'status' => 'active', 'workspace_id' => $workspace->id,
        ])->assertForbidden();

        $preview = $this->postJson($this->modulesUrl($workspace).'/projects/activation-preview')->json('data');
        $this->postJson($this->modulesUrl($workspace).'/projects/activate', [
            'confirmation_token' => $preview['confirmation_token'],
        ])->assertOk();

        $id = $this->postJson('/api/v1/projects', [
            'name' => 'Allowed', 'status' => 'active', 'workspace_id' => $workspace->id,
        ])->assertCreated()->json('data.id');

        $this->postJson($this->modulesUrl($workspace).'/projects/deactivate')->assertOk();
        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $id]);
    }

    private function modulesUrl(Workspace $workspace): string
    {
        return "/api/v1/core/workspaces/{$workspace->id}/modules";
    }

    private function addMember(Workspace $workspace): User
    {
        $member = User::factory()->create(['status' => 'active']);
        WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
            'role_id' => app(RoleProvisioner::class)->workspaceMember($workspace)->id,
            'status' => MembershipStatus::Active,
        ]);

        return $member;
    }

    /** @param list<string> $keys */
    private function entitle(array $keys): void
    {
        $this->app->instance(ModuleEntitlementGate::class, new class($keys) implements ModuleEntitlementGate
        {
            /** @param list<string> $keys */
            public function __construct(private readonly array $keys) {}

            public function isEntitled(Workspace $workspace, string $moduleKey): bool
            {
                return in_array($moduleKey, $this->keys, true);
            }
        });
    }

    private function subscribePersonal(Workspace $workspace): void
    {
        $plans = app(\App\Core\Plans\PlanProvisioner::class);
        $plans->createPlan('api-personal', 'Api Personal', 'personal');
        $plans->createDraftVersion('api-personal', 1, 0);
        $plans->setModuleEntitlement('api-personal', 1, 'projects', true);
        $plans->publish('api-personal', 1);

        $admin = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        app(\App\Core\Subscriptions\SubscriptionService::class)->assignInitial(
            $admin,
            $workspace,
            'api-personal',
            1,
            \Carbon\CarbonImmutable::parse('2026-01-01T00:00:00Z'),
            \Carbon\CarbonImmutable::parse('2027-01-01T00:00:00Z'),
            'C5-3 integration fixture',
            'corr-'.uniqid(),
        );
    }

    private function forceEnable(Workspace $workspace, string $moduleKey, User $actor): void
    {
        WorkspaceModule::create([
            'workspace_id' => $workspace->id,
            'module_id' => CoreModule::query()->where('key', $moduleKey)->sole()->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
            'enabled_at' => now(),
            'enabled_by_user_id' => $actor->id,
        ]);
    }

    /** @return array{0: User, 1: Workspace} */
    private function personalWorkspace(): array
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        return [$owner, $workspace];
    }

    /** @return array{0: User, 1: Organization, 2: Workspace} */
    private function organizationWorkspace(): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$creator, $organization, $workspace];
    }
}
