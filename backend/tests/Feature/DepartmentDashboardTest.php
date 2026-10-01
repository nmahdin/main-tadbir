<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Department;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepartmentDashboardTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_manager_receives_only_records_related_to_managed_department(): void
    {
        $role = Role::create(['key' => 'department-manager', 'name' => 'Department manager', 'is_active' => true]);
        $manager = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        $member = User::factory()->create(['status' => 'active']);
        $outsider = User::factory()->create(['status' => 'active']);
        $department = Department::create(['name' => 'Media', 'manager_id' => $manager->id, 'status' => 'active']);
        $department->members()->attach($member->id, ['role' => 'member']);

        $project = Project::create(['name' => 'Department project', 'status' => 'active', 'project_manager_id' => $member->id]);
        $foreignProject = Project::create(['name' => 'Foreign project', 'status' => 'active', 'project_manager_id' => $outsider->id]);
        $content = Content::create(['title' => 'Department content', 'type' => 'article', 'status' => 'idea', 'owner_id' => $outsider->id, 'project_id' => $project->id, 'payload' => ['departmentId' => (string) $department->id]]);
        Content::create(['title' => 'Foreign content', 'type' => 'article', 'status' => 'idea', 'owner_id' => $outsider->id, 'project_id' => $foreignProject->id, 'payload' => []]);
        Task::create(['title' => 'Department task', 'assignee_id' => $member->id, 'project_id' => $project->id, 'status' => 'backlog']);
        Task::create(['title' => 'Content task', 'assignee_id' => $outsider->id, 'content_id' => $content->id, 'status' => 'backlog']);
        Task::create(['title' => 'Foreign task', 'assignee_id' => $outsider->id, 'project_id' => $foreignProject->id, 'status' => 'backlog']);

        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/departments')->assertForbidden();
        $this->getJson('/api/v1/departments/directory')
            ->assertOk()->assertJsonPath('data.0.managedByMe', true)->assertJsonMissingPath('data.0.managerId');
        $this->getJson('/api/v1/departments/managed')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', (string) $department->id)
            ->assertJsonPath('data.0.managedByMe', true)->assertJsonMissingPath('data.0.managerId');
        $this->getJson('/api/v1/departments/'.$department->id.'/dashboard')
            ->assertOk()
            ->assertJsonPath('data.department.id', (string) $department->id)
            ->assertJsonCount(1, 'data.projects')
            ->assertJsonCount(1, 'data.contents')
            ->assertJsonCount(2, 'data.tasks')
            ->assertJsonFragment(['title' => 'Department task'])
            ->assertJsonFragment(['title' => 'Content task'])
            ->assertJsonMissing(['title' => 'Foreign task']);
    }

    public function test_non_manager_cannot_open_department_dashboard(): void
    {
        $manager = User::factory()->create(['status' => 'active']);
        $outsider = User::factory()->create(['status' => 'active']);
        $department = Department::create(['name' => 'Private', 'manager_id' => $manager->id, 'status' => 'active']);

        Sanctum::actingAs($outsider);
        $this->getJson('/api/v1/departments/'.$department->id.'/dashboard')->assertForbidden();
    }
}
