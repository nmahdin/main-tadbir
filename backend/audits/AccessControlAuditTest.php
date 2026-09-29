<?php

namespace Tests\Audits;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Opt-in security acceptance probes, NOT assertions that unsafe behavior is correct.
 * Run against phpunit.xml's isolated in-memory DB only. Failures identify open gaps.
 * Kept outside normal discovery until each policy/fix is promoted to regression tests.
 */
class AccessControlAuditTest extends TestCase
{
    use DatabaseMigrations;

    public $mockConsoleOutput = false;

    public function runDatabaseMigrations(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Audit probes require the isolated in-memory SQLite test database.');
        }
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    private function actor(array $permissions = [], array $attributes = []): User
    {
        $role = Role::create(['key' => 'audit_'.Str::random(10), 'name' => 'Audit', 'is_active' => true]);
        foreach ($permissions as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'audit']);
            $role->permissions()->attach($permission);
        }

        return User::factory()->create([...['username' => 'audit_'.Str::random(10), 'status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key], ...$attributes])->fresh();
    }

    private function task(User $owner): Task
    {
        return Task::create(['title' => 'Private task', 'assignee_id' => $owner->id, 'kind' => 'general', 'status' => 'todo', 'priority' => 'medium']);
    }

    private function content(User $owner, array $payload = []): Content
    {
        return Content::create(['title' => 'Private content', 'type' => 'article', 'status' => 'idea', 'owner_id' => $owner->id,
            'payload' => ['title' => 'Private content', 'type' => 'article', 'status' => 'idea', ...$payload]]);
    }

    private function message(User $owner): DomainRecord
    {
        $conversation = DomainRecord::create(['domain' => DomainRecord::DOMAIN_CONVERSATION, 'user_id' => $owner->id,
            'payload' => ['memberIds' => [(string) $owner->id], 'type' => 'direct']]);

        return DomainRecord::create(['domain' => DomainRecord::DOMAIN_CHAT_MESSAGE, 'user_id' => $owner->id, 'parent_id' => $conversation->id,
            'payload' => ['senderId' => (string) $owner->id, 'conversationId' => (string) $conversation->id, 'text' => 'Private message']]);
    }

    private function assertDenied($response, string $reason): void
    {
        $this->assertContains($response->status(), [403, 404], $reason.'; HTTP '.$response->status());
    }

    public function test_a01_blocked_existing_session_cannot_read_tasks(): void
    {
        Sanctum::actingAs($this->actor(['tasks.view'], ['status' => 'blocked']));
        $this->assertDenied($this->getJson('/api/v1/tasks'), 'Blocked session must stop at server');
    }

    public function test_a02_disabled_role_does_not_grant_task_access(): void
    {
        $actor = $this->actor(['tasks.view']);
        $actor->role->update(['is_active' => false]);
        Sanctum::actingAs($actor->fresh());
        $this->assertDenied($this->getJson('/api/v1/tasks'), 'Disabled role still grants backend permissions');
    }

    public function test_a03_status_permission_cannot_change_task_title_via_full_update(): void
    {
        $task = $this->task($this->actor());
        Sanctum::actingAs($this->actor(['tasks.status']));
        $this->assertDenied($this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'Unauthorized edit', 'status' => 'in_progress']), 'Mixed payload must check each operation');
        $this->assertSame('Private task', $task->fresh()->title);
    }

    public function test_a04_unrelated_content_viewer_cannot_read_content(): void
    {
        $content = $this->content($this->actor());
        Sanctum::actingAs($this->actor(['content.view']));
        $this->assertDenied($this->getJson('/api/v1/contents/'.$content->id), 'Role view alone is not content relationship');
    }

    public function test_a05_department_member_can_edit_without_role_content_edit(): void
    {
        $department = Department::create(['name' => 'Audit department', 'status' => 'active']);
        $member = $this->actor([], ['department_id' => $department->id]);
        $content = $this->content($this->actor(), ['departmentId' => (string) $department->id]);
        Sanctum::actingAs($member);
        $this->putJson('/api/v1/contents/'.$content->id, ['title' => 'Authorized member edit'])->assertOk();
    }

    public function test_a06_content_edit_does_not_authorize_publication(): void
    {
        $actor = $this->actor(['content.edit']);
        $content = $this->content($actor);
        Sanctum::actingAs($actor);
        $this->assertDenied($this->putJson('/api/v1/contents/'.$content->id, ['status' => 'published', 'publishInfo' => ['status' => 'published']]), 'Publishing requires separate authority');
    }

    public function test_a07_chat_nonmember_cannot_read_message(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->getJson('/api/v1/chat/messages/'.$message->id), 'Message read must require conversation membership');
    }

    public function test_a08_chat_nonmember_cannot_edit_message(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->putJson('/api/v1/chat/messages/'.$message->id, ['text' => 'Unauthorized edit']), 'Message edit must require authorship and membership');
    }

    public function test_a09_batch_delete_cannot_bypass_message_delete_policy(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->postJson('/api/v1/chat/messages/batch-delete', ['ids' => [$message->id]]);
        $this->assertDatabaseHas('domain_records', ['id' => $message->id]);
    }

    public function test_a10_users_edit_cannot_promote_another_account_to_admin(): void
    {
        $admin = Role::create(['key' => 'admin', 'name' => 'Admin', 'is_system' => true, 'is_active' => true]);
        $target = $this->actor();
        Sanctum::actingAs($this->actor(['users.edit']));
        $this->assertDenied($this->putJson('/api/v1/users/'.$target->id, ['roleId' => (string) $admin->id]), 'Profile editing must not grant admin assignment');
    }

    public function test_a11_status_only_operator_can_change_account_status(): void
    {
        $target = $this->actor();
        Sanctum::actingAs($this->actor(['users.status']));
        $this->putJson('/api/v1/users/'.$target->id, ['status' => 'blocked'])->assertOk();
    }

    public function test_a12_unprivileged_user_cannot_read_global_activity_log(): void
    {
        $owner = $this->actor();
        ActivityLog::create(['user_id' => $owner->id, 'type' => 'audit', 'action' => 'Private activity']);
        Sanctum::actingAs($this->actor());
        $response = $this->getJson('/api/v1/activity-logs');
        if ($response->status() === 200) {
            $response->assertJsonMissing(['action' => 'Private activity']);
        } else {
            $this->assertDenied($response, 'Global activity visibility requires policy');
        }
    }

    public function test_a13_idea_vote_does_not_allow_replacing_other_users_votes(): void
    {
        $owner = $this->actor();
        $idea = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'Idea', 'owner_id' => $owner->id,
            'payload' => ['title' => 'Idea', 'votes' => [['userId' => (string) $owner->id, 'option' => 'approve']]]]);
        Sanctum::actingAs($this->actor(['thinktank.vote']));
        $response = $this->putJson('/api/v1/ideas/'.$idea->id, ['votes' => []]);
        if ($response->status() === 200) {
            $this->assertNotEmpty($idea->fresh()->payload['votes'], 'Voting cannot erase somebody else vote');
        } else {
            $this->assertDenied($response, 'Reject aggregate vote replacement');
        }
    }

    public function test_a14_pending_user_cannot_login(): void
    {
        $user = $this->actor([], ['status' => 'pending', 'password' => 'Auditpass123']);
        $this->postJson('/api/v1/auth/login', ['login' => $user->username, 'password' => 'Auditpass123'])->assertForbidden();
    }

    public function test_a15_positive_control_single_message_delete_is_denied(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->deleteJson('/api/v1/chat/messages/'.$message->id), 'Single delete does have an ownership check');
    }

    public function test_a16_positive_control_profile_editor_cannot_change_own_role(): void
    {
        $actor = $this->actor(['users.edit']);
        $otherRole = Role::create(['key' => 'audit_other', 'name' => 'Other']);
        Sanctum::actingAs($actor);
        $this->assertDenied($this->putJson('/api/v1/users/'.$actor->id, ['roleId' => (string) $otherRole->id]), 'Self-role protection exists');
    }
}
