<?php

namespace Tests\Feature\Projects;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage 04B — Projects workspace isolation pilot.
 *
 * Exercises the scoped path end to end (central authorization,
 * workspace-owned records, cross-workspace denial, firewall against
 * the legacy path) and pins the legacy path's preservation for
 * workspace-less records. Scoped operations engage the central
 * module/policy/entitlement gates through the narrowly scoped pilot
 * policy: setUp performs the explicit non-production opt-in the
 * policy requires, and dedicated tests below pin the denial cases
 * (opt-in off, production environment, other modules).
 */
class ProjectsWorkspacePilotTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Explicit pilot opt-in (config/projects.php): non-production
        // test environment + flag on.
        config(['projects.workspace_pilot.enabled' => true]);
    }

    public function test_scoped_crud_happy_path(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();

        [$id] = $this->createProject($owner, $workspace->id);

        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertOk()
            ->assertJsonPath('data.workspaceId', (string) $workspace->id);
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Renamed'], ['X-Workspace-Id' => (string) $workspace->id])
            ->assertOk();
        $this->deleteJson("/api/v1/projects/{$id}", [], ['X-Workspace-Id' => (string) $workspace->id])
            ->assertNoContent();
        $this->assertDatabaseHas('projects', ['id' => $id, 'status' => 'archived']);
    }

    public function test_two_workspaces_are_isolated(): void
    {
        [$ownerA, $workspaceA] = $this->workspaceOwner();
        [$ownerB, $workspaceB] = $this->workspaceOwner();

        [$idA] = $this->createProject($ownerA, $workspaceA->id);
        [$idB] = $this->createProject($ownerB, $workspaceB->id);

        Sanctum::actingAs($ownerB);
        // Direct ID access across workspaces: foreign ≡ missing, both
        // without a context header (record-derived scoped mode) and
        // with the other workspace requested.
        $this->getJson("/api/v1/projects/{$idA}")->assertForbidden();
        $this->getJson("/api/v1/projects/{$idA}", ['X-Workspace-Id' => (string) $workspaceB->id])->assertNotFound();
        $this->patchJson("/api/v1/projects/{$idA}", ['name' => 'Hijack'])->assertForbidden();
        $this->deleteJson("/api/v1/projects/{$idA}")->assertForbidden();
        $this->getJson("/api/v1/projects?workspace_id={$workspaceB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/projects?workspace_id={$workspaceA->id}")->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $idB, 'workspace_id' => $workspaceB->id]);
    }

    public function test_organization_member_without_workspace_membership_gets_no_access(): void
    {
        $creator = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme Org');
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        $member = User::factory()->create();
        OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);

        [$id] = $this->createProject($creator, $workspace->id);

        Sanctum::actingAs($member);
        $this->getJson("/api/v1/projects/{$id}")->assertForbidden();
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")->assertForbidden();
    }

    public function test_workspace_member_without_project_permission_is_denied(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        [$id] = $this->createProject($owner, $workspace->id);

        $viewer = User::factory()->create();
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $viewer->id,
            'status' => MembershipStatus::Active,
        ]);
        // Default Member role holds only workspace.view.
        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        Sanctum::actingAs($viewer);
        $this->getJson("/api/v1/projects/{$id}")->assertForbidden();
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")->assertForbidden();

        // Grant exactly projects.view through a custom role.
        $role = app(WorkspaceRoleService::class)->createCustomRole($owner, $workspace, 'Project Viewer', ['projects.view']);
        app(WorkspaceRoleService::class)->assignRole($owner, $membership->refresh(), $role);

        $this->getJson("/api/v1/projects/{$id}")->assertOk();
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Nope'])->assertForbidden();
        $this->deleteJson("/api/v1/projects/{$id}")->assertForbidden();
    }

    public function test_cross_workspace_relationships_are_rejected(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        $outsider = User::factory()->create();

        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/projects', [
            'name' => 'Bad members',
            'workspace_id' => $workspace->id,
            'memberIds' => [$outsider->id],
        ])->assertUnprocessable();

        [$id] = $this->createProject($owner, $workspace->id);
        $this->postJson("/api/v1/projects/{$id}/content-plan", [
            'contentType' => 'video',
            'plannedCount' => 2,
            'defaultSeriesId' => null,
        ], ['X-Workspace-Id' => (string) $workspace->id])->assertCreated();

        $this->assertDatabaseHas('project_content_plans', [
            'project_id' => $id,
            'workspace_id' => $workspace->id,
        ]);
    }

    public function test_content_plan_and_operations_are_scoped(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        [$other, $otherWorkspace] = $this->workspaceOwner();
        [$id] = $this->createProject($owner, $workspace->id);

        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/projects/{$id}/content-plan", [
            'contentType' => 'article',
            'plannedCount' => 3,
        ], ['X-Workspace-Id' => (string) $workspace->id])->assertCreated();
        $this->getJson("/api/v1/projects/{$id}/content-plan", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/projects/{$id}/operations/summary", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertOk();

        Sanctum::actingAs($other);
        $this->getJson("/api/v1/projects/{$id}/content-plan")->assertForbidden();
        $this->getJson("/api/v1/projects/{$id}/operations/summary")->assertForbidden();
        $this->getJson("/api/v1/projects/{$id}/operations/tasks")->assertForbidden();
        $this->assertSame(0, Project::where('workspace_id', $otherWorkspace->id)->count());
    }

    public function test_archive_restore_search_and_inactive_states(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        [$id] = $this->createProject($owner, $workspace->id);

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/v1/projects/{$id}", [], ['X-Workspace-Id' => (string) $workspace->id])
            ->assertNoContent();
        $this->postJson("/api/v1/projects/{$id}/restore")->assertOk();
        $this->assertDatabaseHas('projects', ['id' => $id, 'status' => 'active']);

        // Legacy global search must never surface workspace-owned
        // records, even for an actor holding legacy projects.view.
        Sanctum::actingAs($this->legacyUserWithProjectsAccess());
        $this->getJson('/api/v1/search?query=Scoped')->assertOk()
            ->assertJsonCount(0, 'data.projects');

        // Deactivated membership blocks scoped access.
        [$memberOwner, $memberWorkspace] = $this->workspaceOwner();
        [$memberProjectId] = $this->createProject($memberOwner, $memberWorkspace->id);
        $membership = WorkspaceMembership::where('workspace_id', $memberWorkspace->id)
            ->where('user_id', $memberOwner->id)->firstOrFail();
        // Owner membership cannot be deactivated in fixtures without a
        // second manager path; use a plain member instead.
        $member = User::factory()->create();
        $plain = WorkspaceMembership::create([
            'workspace_id' => $memberWorkspace->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        $role = app(WorkspaceRoleService::class)->createCustomRole($memberOwner, $memberWorkspace, 'Project Viewer', ['projects.view']);
        app(WorkspaceRoleService::class)->assignRole($memberOwner, $plain, $role);

        Sanctum::actingAs($member);
        $this->getJson("/api/v1/projects/{$memberProjectId}")->assertOk();
        $plain->deactivate();
        $this->getJson("/api/v1/projects/{$memberProjectId}")->assertForbidden();

        // Suspended workspace blocks scoped access.
        $memberWorkspace->forceFill(['status' => 'suspended'])->save();
        Sanctum::actingAs($memberOwner);
        $this->getJson("/api/v1/projects/{$memberProjectId}", ['X-Workspace-Id' => (string) $memberWorkspace->id])
            ->assertForbidden();
        $this->assertNotNull($membership);
    }

    public function test_legacy_path_is_preserved_and_firewalled(): void
    {
        $legacyAdmin = $this->legacyUserWithProjectsAccess();
        Sanctum::actingAs($legacyAdmin);
        $legacyId = $this->postJson('/api/v1/projects', ['name' => 'Legacy Project', 'status' => 'active'])
            ->assertCreated()
            ->json('data.id');
        $this->assertDatabaseHas('projects', ['id' => $legacyId, 'workspace_id' => null]);

        [$owner, $workspace] = $this->workspaceOwner();
        [$scopedId] = $this->createProject($owner, $workspace->id);

        // Legacy listing cannot see the workspace-owned project, and a
        // direct request is decided by the central engine: an actor
        // with no membership in the record's workspace is denied (403,
        // the engine's membership taxonomy); the record is never
        // served through the legacy path.
        Sanctum::actingAs($legacyAdmin);
        $this->getJson('/api/v1/projects')->assertOk()
            ->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/projects/{$scopedId}")->assertForbidden();

        // Scoped listing cannot see the legacy project; asking for the
        // legacy record inside a workspace context is foreign ≡ missing.
        Sanctum::actingAs($owner);
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/projects/{$legacyId}", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertNotFound();
    }

    public function test_unresolved_gate_identifiers_fail_closed_at_engine_level(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();

        $service = app(\App\Core\Authorization\AuthorizationService::class);
        // No real module id is registered for gates; an unresolvable
        // gate identifier must fail closed, never silently pass.
        $this->expectException(\App\Core\Authorization\AuthorizationDeniedException::class);
        $service->authorize($owner, $workspace->id, 'projects.view', 'unimplemented-module');
    }

    public function test_pilot_gates_deny_scoped_access_without_explicit_opt_in(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        [$id] = $this->createProject($owner, $workspace->id);

        config(['projects.workspace_pilot.enabled' => false]);

        Sanctum::actingAs($owner);
        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertForbidden();
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")->assertForbidden();
        $this->postJson('/api/v1/projects', [
            'name' => 'Gated Out',
            'workspace_id' => $workspace->id,
        ])->assertForbidden();
    }

    public function test_pilot_gates_fail_closed_in_production_even_when_opted_in(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();
        [$id] = $this->createProject($owner, $workspace->id);

        // Opt-in is on (setUp); a production environment must still
        // fail closed — the pilot allowance has a hard production stop.
        $this->app->instance('env', 'production');

        Sanctum::actingAs($owner);
        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])
            ->assertForbidden();
        $this->postJson('/api/v1/projects', [
            'name' => 'Production Blocked',
            'workspace_id' => $workspace->id,
        ])->assertForbidden();
        $this->assertDatabaseMissing('projects', ['name' => 'Production Blocked']);
    }

    public function test_pilot_policy_never_affirms_other_modules_or_permissions(): void
    {
        [, $workspace] = $this->workspaceOwner();
        $policy = new \App\Modules\Projects\Pilot\PilotGatePolicy;

        $this->assertTrue($policy->allowsModule('projects'));
        $this->assertFalse($policy->allowsModule('tasks'));
        $this->assertFalse($policy->allowsModule('contents'));
        $this->assertTrue($policy->allowsPermission('projects.view'));
        $this->assertFalse($policy->allowsPermission('tasks.view'));

        $gate = new \App\Modules\Projects\Pilot\PilotModuleAvailabilityGate($policy);
        $this->assertTrue($gate->evaluate($workspace, 'projects')->isAllowed());
        $this->assertFalse($gate->evaluate($workspace, 'tasks')->isAllowed());
        $entitlement = new \App\Modules\Projects\Pilot\PilotSubscriptionEntitlementGate($policy);
        $this->assertFalse($entitlement->evaluate($workspace, 'billing')->isAllowed());
    }

    public function test_template_created_tasks_inherit_project_workspace(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();

        $template = \App\Models\ProjectTemplate::create([
            'name' => 'Pilot Template',
            'is_active' => true,
            'tasks' => [['title' => 'Template task']],
            'created_by' => $owner->id,
        ]);

        // Template fan-out is an unmigrated legacy service: during the
        // pilot it still requires its legacy tasks.create permission
        // (fail-closed); the scoped project stamps the fanned-out
        // tasks with its workspace.
        $dual = $this->legacyUserWithProjectsAccess(['tasks.create']);
        WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $dual->id,
            'status' => MembershipStatus::Active,
        ]);
        $role = app(WorkspaceRoleService::class)->createCustomRole($owner, $workspace, 'Dual Holder', [
            'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
        ]);
        $dualMembership = WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $dual->id)->firstOrFail();
        app(WorkspaceRoleService::class)->assignRole($owner, $dualMembership, $role);

        Sanctum::actingAs($dual);
        $id = $this->postJson('/api/v1/projects', [
            'name' => 'From Template',
            'workspace_id' => $workspace->id,
            'templateId' => $template->id,
            'projectManagerId' => $dual->id,
        ])->assertCreated()->json('data.id');

        $task = Task::where('project_id', $id)->first();
        $this->assertNotNull($task);
        $this->assertSame($workspace->id, (int) $task->workspace_id);
    }

    /**
     * @return array{0: User, 1: Workspace}
     */
    private function workspaceOwner(): array
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        return [$owner, $workspace];
    }

    /**
     * @return array{0: int}
     */
    private function createProject(User $owner, int $workspaceId): array
    {
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/projects', [
            'name' => 'Scoped Project',
            'status' => 'active',
            'workspace_id' => $workspaceId,
        ])->assertCreated()->json('data.id');
        $this->assertDatabaseHas('projects', ['id' => $id, 'workspace_id' => $workspaceId]);

        return [(int) $id];
    }

    private function legacyUserWithProjectsAccess(array $extraPermissions = []): User
    {
        $role = \App\Models\Role::create([
            'key' => 'pilot-legacy-'.uniqid(),
            'name' => 'Pilot Legacy',
            'is_active' => true,
        ]);
        foreach (['projects.view', 'projects.create', 'projects.edit', 'projects.delete', ...$extraPermissions] as $key) {
            $role->permissions()->attach(\App\Models\Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            ));
        }

        return User::factory()->create(['role_id' => $role->id, 'role_key' => $role->key, 'status' => 'active']);
    }
}
