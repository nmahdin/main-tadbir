<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiConnectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_workspace_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/projects')->assertUnauthorized();
        $this->getJson('/api/v1/tasks')->assertUnauthorized();
        $this->getJson('/api/v1/users/directory')->assertUnauthorized();
    }

    public function test_authenticated_user_can_create_and_update_project_and_task(): void
    {
        $user = User::factory()->create(['username' => 'api.user']);
        $role = Role::create([
            'key' => 'project_api_test',
            'name' => 'Project API Test',
            'description' => 'Test role',
            'color' => '#000000',
            'is_system' => false,
            'is_active' => true,
        ]);
        $permissions = collect(['projects.view', 'projects.create', 'content.view', 'content.create'])->map(fn (string $key) => Permission::create([
            'key' => $key,
            'label' => $key,
            'description' => $key,
            'category' => 'projects',
        ]));
        $role->permissions()->sync($permissions->pluck('id'));
        $user->update(['role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        $projectResponse = $this->postJson('/api/v1/projects', [
            'name' => 'API Integration',
            'key' => 'API26',
            'description' => 'Connected from the React frontend',
            'projectManagerId' => (string) $user->id,
            'memberIds' => [(string) $user->id],
            'status' => 'active',
            'priority' => 'high',
            'startDate' => '2026-09-17',
            'deadline' => '2026-10-17',
            'tags' => ['api'],
        ])->assertCreated()
            ->assertJsonPath('data.projectManagerId', (string) $user->id)
            ->assertJsonPath('data.memberIds.0', (string) $user->id);

        $projectId = $projectResponse->json('data.id');

        $taskResponse = $this->postJson('/api/v1/tasks', [
            'title' => 'Verify integration',
            'projectId' => $projectId,
            'assigneeId' => (string) $user->id,
            'status' => 'todo',
            'priority' => 'urgent',
            'estimatedHours' => 4,
        ])->assertCreated()
            ->assertJsonPath('data.projectId', $projectId)
            ->assertJsonPath('data.assigneeId', (string) $user->id);

        $taskId = $taskResponse->json('data.id');

        $this->patchJson("/api/v1/tasks/{$taskId}/status", ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->getJson("/api/v1/projects/{$projectId}")
            ->assertOk()
            ->assertJsonPath('data.progress', 100);

        $this->getJson('/api/v1/tasks?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $contentResponse = $this->postJson('/api/v1/contents', [
            'title' => 'Persisted content',
            'type' => 'article',
            'status' => 'planning',
            'ownerId' => (string) $user->id,
            'deadline' => '2026-10-20',
            'topic' => 'API persistence',
            'stages' => [['id' => 'stage-1', 'title' => 'Draft']],
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Persisted content')
            ->assertJsonPath('data.topic', 'API persistence');

        $this->getJson('/api/v1/contents?per_page=100')
            ->assertOk()
            ->assertJsonPath('data.0.id', $contentResponse->json('data.id'));
    }

    public function test_user_directory_exposes_only_non_sensitive_profile_fields(): void
    {
        $user = User::factory()->create([
            'username' => 'directory.user',
            'title' => 'Developer',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/users/directory')
            ->assertOk()
            ->assertJsonPath('data.0.id', (string) $user->id)
            ->assertJsonMissingPath('data.0.email')
            ->assertJsonMissingPath('data.0.permissions')
            ->assertJsonMissingPath('data.0.role');
    }
}
