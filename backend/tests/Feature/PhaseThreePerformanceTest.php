<?php

namespace Tests\Feature;

use App\Models\Comment;
use App\Models\Content;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\TaskAttachment;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhaseThreePerformanceTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private int $roleSequence = 0;

    private function actor(array $permissions): User
    {
        $this->roleSequence++;
        $role = Role::create(['key' => 'phase3-'.$this->roleSequence, 'name' => 'Phase 3', 'is_active' => true]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_global_search_is_compact_validated_and_permission_scoped(): void
    {
        $this->getJson('/api/v1/search?query=Needle')->assertUnauthorized();
        $this->actor(['projects.view']);
        Project::create(['name' => 'Needle project', 'status' => 'active']);
        Task::create(['title' => 'Needle task', 'status' => 'todo']);
        Content::create(['title' => 'Needle content', 'type' => 'article', 'status' => 'idea', 'payload' => []]);

        $this->getJson('/api/v1/search?query=N')->assertUnprocessable();
        $this->getJson('/api/v1/search?query=Needle&limit=9')->assertUnprocessable();
        $this->getJson('/api/v1/search?query=Needle&unknown=1')->assertOk();
        $this->getJson('/api/v1/search?query=Needle')
            ->assertOk()
            ->assertJsonPath('data.projects.0.name', 'Needle project')
            ->assertJsonCount(0, 'data.tasks')
            ->assertJsonCount(0, 'data.contents')
            ->assertJsonMissingPath('data.projects.0.memberIds');
    }

    public function test_global_search_returns_all_authorized_core_modules(): void
    {
        $this->actor(['projects.view', 'tasks.view', 'content.view']);
        $project = Project::create(['name' => 'Launch Alpha', 'status' => 'active', 'color' => '#123456']);
        Task::create(['title' => 'Launch Alpha task', 'status' => 'todo', 'priority' => 'high', 'project_id' => $project->id]);
        Content::create(['title' => 'Launch Alpha content', 'type' => 'article', 'status' => 'idea', 'payload' => ['topic' => 'Alpha']]);

        $this->getJson('/api/v1/search?query=Alpha&limit=2')
            ->assertOk()
            ->assertJsonPath('data.projects.0.id', (string) $project->id)
            ->assertJsonPath('data.tasks.0.project.name', 'Launch Alpha')
            ->assertJsonPath('data.contents.0.topic', 'Alpha')
            ->assertJsonPath('meta.limit', 2);
    }

    public function test_task_lists_do_not_load_detail_histories(): void
    {
        $user = $this->actor(['tasks.view']);
        $task = Task::create(['title' => 'Compact row', 'status' => 'todo', 'assignee_id' => $user->id]);
        Comment::create(['subject_type' => 'task', 'subject_id' => $task->id, 'user_id' => $user->id, 'body' => 'Heavy history']);
        TaskAttachment::create(['task_id' => $task->id, 'name' => 'large.pdf', 'size' => '10 MB', 'type' => 'application/pdf', 'url' => '/private/file', 'uploaded_by' => $user->id]);

        $this->getJson('/api/v1/tasks?per_page=20')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Compact row')
            ->assertJsonMissingPath('data.0.comments')
            ->assertJsonMissingPath('data.0.attachments')
            ->assertJsonMissingPath('data.0.activityHistory');
        $this->getJson('/api/v1/tasks/'.$task->id)
            ->assertOk()
            ->assertJsonPath('data.comments.0.text', 'Heavy history')
            ->assertJsonPath('data.attachments.0.name', 'large.pdf');
    }

    public function test_analytics_uses_server_aggregates_and_requires_report_permission(): void
    {
        $this->actor([]);
        $this->getJson('/api/v1/analytics/summary')->assertForbidden();

        $actor = $this->actor(['reports.view']);
        $department = Department::create(['name' => 'Product', 'status' => 'active']);
        $actor->update(['department_id' => $department->id]);
        Project::create(['name' => 'Done', 'status' => 'completed', 'progress' => 100]);
        Project::create(['name' => 'Active', 'status' => 'active', 'progress' => 40]);
        Task::create(['title' => 'Done', 'status' => 'completed', 'assignee_id' => $actor->id]);
        Task::create(['title' => 'Open', 'status' => 'todo', 'priority' => 'high', 'assignee_id' => $actor->id, 'deadline' => today()->subDay()]);
        Content::create(['title' => 'Published', 'type' => 'article', 'status' => 'published', 'payload' => []]);
        WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'Approved', 'status' => 'approved', 'payload' => []]);
        WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_LETTER, 'title' => 'Answered', 'status' => 'answered', 'payload' => []]);

        $this->getJson('/api/v1/analytics/summary')
            ->assertOk()
            ->assertJsonPath('data.projects.total', 2)
            ->assertJsonPath('data.projects.completionRate', 50)
            ->assertJsonPath('data.tasks.overdue', 1)
            ->assertJsonPath('data.tasks.byStatus.todo', 1)
            ->assertJsonPath('data.contents.publishRate', 100)
            ->assertJsonPath('data.ideas.approvalRate', 100)
            ->assertJsonPath('data.letters.responded', 1)
            ->assertJsonPath('data.departments.0.activeTasks', 1)
            ->assertJsonPath('meta.departmentMembership', 'primary');
    }

    public function test_every_api_response_has_a_server_request_id(): void
    {
        $success = $this->getJson('/api/v1/health')->assertOk();
        $error = $this->getJson('/api/v1/search?query=test')->assertUnauthorized();
        $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
        $successId = $success->headers->get('X-Request-ID');
        $errorId = $error->headers->get('X-Request-ID');

        $this->assertIsString($successId);
        $this->assertIsString($errorId);
        $this->assertMatchesRegularExpression($pattern, $successId);
        $this->assertMatchesRegularExpression($pattern, $errorId);
        $this->assertNotSame($successId, $errorId);
    }
}
