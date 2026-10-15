<?php

namespace Tests\Feature\Projects;

use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage 04B hardening — legacy analytics isolation.
 *
 * The legacy reporting surface (analytics summary, department
 * dashboard, user directory aggregates) describes workspace-less
 * legacy data only. Workspace-owned projects and workspace-stamped
 * tasks from two different workspaces must not contribute
 * identifiers, names or counts to any of it, while legacy behavior
 * for workspace-less records is preserved exactly.
 */
class ProjectsAnalyticsIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_analytics_summary_excludes_workspace_owned_records_from_two_workspaces(): void
    {
        [$ownerA, $workspaceA] = $this->workspaceOwner();
        [$ownerB, $workspaceB] = $this->workspaceOwner();

        $legacy = Project::create(['name' => 'Legacy Visible Project', 'status' => 'active', 'progress' => 10]);
        $scopedA = Project::create(['name' => 'Workspace A Secret', 'status' => 'active', 'progress' => 20, 'workspace_id' => $workspaceA->id, 'project_manager_id' => $ownerA->id]);
        $scopedB = Project::create(['name' => 'Workspace B Secret', 'status' => 'completed', 'progress' => 30, 'workspace_id' => $workspaceB->id, 'project_manager_id' => $ownerB->id]);
        Task::create(['title' => 'Legacy task', 'status' => 'backlog', 'project_id' => $legacy->id]);
        Task::create(['title' => 'A task', 'status' => 'in_progress', 'project_id' => $scopedA->id, 'workspace_id' => $workspaceA->id]);
        Task::create(['title' => 'B task', 'status' => 'completed', 'project_id' => $scopedB->id, 'workspace_id' => $workspaceB->id]);

        // Workspace actors without the legacy reporting permission
        // get nothing from the installation-wide endpoint.
        Sanctum::actingAs($ownerA);
        $this->getJson('/api/v1/analytics/summary')->assertForbidden();
        Sanctum::actingAs($ownerB);
        $this->getJson('/api/v1/analytics/summary')->assertForbidden();

        $reporter = $this->legacyUser(['reports.view']);
        Sanctum::actingAs($reporter);
        $response = $this->getJson('/api/v1/analytics/summary')->assertOk()
            // Only the workspace-less legacy project/task are counted.
            ->assertJsonPath('data.projects.total', 1)
            ->assertJsonPath('data.projects.completed', 0)
            ->assertJsonPath('data.projects.active.0.id', (string) $legacy->id)
            ->assertJsonPath('data.projects.active.0.name', 'Legacy Visible Project')
            ->assertJsonPath('data.tasks.total', 1)
            ->assertJsonPath('data.tasks.completed', 0)
            ->assertJsonPath('data.tasks.byStatus.backlog', 1)
            ->assertJsonMissingPath('data.tasks.byStatus.in_progress');

        $content = $response->getContent();
        $this->assertStringNotContainsString('Workspace A Secret', $content);
        $this->assertStringNotContainsString('Workspace B Secret', $content);
        $this->assertStringNotContainsString('"id":"'.$scopedA->id.'"', $content);
        $this->assertStringNotContainsString('"id":"'.$scopedB->id.'"', $content);
    }

    public function test_department_dashboard_excludes_workspace_owned_projects(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();

        $manager = $this->legacyUser(['departments.view']);
        $department = Department::create(['name' => 'Ops', 'status' => 'active', 'manager_id' => $manager->id]);

        Project::create(['name' => 'Legacy Dept Project', 'status' => 'active', 'project_manager_id' => $manager->id]);
        Project::create(['name' => 'Workspace Dept Secret', 'status' => 'active', 'project_manager_id' => $manager->id, 'workspace_id' => $workspace->id]);

        Sanctum::actingAs($manager);
        $response = $this->getJson("/api/v1/departments/{$department->id}/dashboard")->assertOk();
        $content = $response->getContent();
        $this->assertStringContainsString('Legacy Dept Project', $content);
        $this->assertStringNotContainsString('Workspace Dept Secret', $content);
        $this->assertNotNull($owner);
    }

    public function test_user_directory_counts_exclude_workspace_owned_records(): void
    {
        [$owner, $workspace] = $this->workspaceOwner();

        $legacyProject = Project::create(['name' => 'Legacy Managed', 'status' => 'active', 'project_manager_id' => $owner->id]);
        $workspaceProject = Project::create(['name' => 'Workspace Managed', 'status' => 'active', 'project_manager_id' => $owner->id, 'workspace_id' => $workspace->id]);
        // The directory counts membership (projects relation): the
        // owner belongs to both, so only the firewall keeps the
        // workspace-owned project out of the count.
        $legacyProject->members()->attach($owner->id);
        $workspaceProject->members()->attach($owner->id);
        Task::create(['title' => 'Legacy done', 'status' => 'completed', 'assignee_id' => $owner->id]);
        Task::create(['title' => 'Workspace done', 'status' => 'completed', 'assignee_id' => $owner->id, 'workspace_id' => $workspace->id]);

        $admin = $this->legacyUser(['users.view']);
        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/users')->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', (string) $owner->id)
            ?? collect($response->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($row);
        $this->assertSame(1, $row['activeProjectsCount']);
        $this->assertSame(1, $row['completedTasksCount']);
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

    private function legacyUser(array $permissions): User
    {
        $role = Role::create([
            'key' => 'analytics-legacy-'.uniqid(),
            'name' => 'Analytics Legacy',
            'is_active' => true,
        ]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            ));
        }

        return User::factory()->create(['role_id' => $role->id, 'role_key' => $role->key, 'status' => 'active']);
    }
}
