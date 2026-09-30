<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UnifiedCommentsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_all_supported_subjects_write_to_one_comments_table_and_list_with_subject_context(): void
    {
        $user = $this->actor();
        $task = Task::create(['title' => 'Task subject', 'assignee_id' => $user->id]);
        $content = Content::create(['title' => 'Content subject', 'type' => 'article', 'status' => 'idea', 'owner_id' => $user->id, 'payload' => []]);
        $idea = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'Idea subject', 'owner_id' => $user->id, 'payload' => []]);
        $asset = DomainRecord::create(['domain' => DomainRecord::DOMAIN_ASSET, 'title' => 'Asset subject', 'user_id' => $user->id, 'payload' => []]);

        foreach ([['task', $task->id], ['content', $content->id], ['idea', $idea->id], ['asset', $asset->id]] as [$type, $id]) {
            $this->postJson('/api/v1/comments', ['subjectType' => $type, 'subjectId' => $id, 'text' => "Comment for {$type}"])
                ->assertCreated()->assertJsonPath('data.subjectType', $type)->assertJsonPath('data.userId', (string) $user->id);
        }

        $this->assertDatabaseCount('comments', 4);
        $this->assertDatabaseHas('comments', ['subject_type' => 'task', 'subject_id' => $task->id, 'body' => 'Comment for task']);
        $this->getJson('/api/v1/comments?per_page=20')->assertOk()->assertJsonPath('meta.total', 4)
            ->assertJsonPath('data.0.subjectTitle', 'Asset subject')->assertJsonStructure(['data' => [['subjectType', 'subjectId', 'subjectTitle', 'subjectUrl', 'userName']]]);
    }

    public function test_reply_must_belong_to_same_subject_and_owner_can_delete_comment(): void
    {
        $user = $this->actor();
        $first = Content::create(['title' => 'First', 'type' => 'article', 'status' => 'idea', 'owner_id' => $user->id, 'payload' => []]);
        $second = Content::create(['title' => 'Second', 'type' => 'article', 'status' => 'idea', 'owner_id' => $user->id, 'payload' => []]);
        $parent = $this->postJson('/api/v1/comments', ['subjectType' => 'content', 'subjectId' => $first->id, 'text' => 'Parent'])->assertCreated()->json('data.id');

        $this->postJson('/api/v1/comments', ['subjectType' => 'content', 'subjectId' => $second->id, 'text' => 'Forged reply', 'replyToId' => $parent])
            ->assertUnprocessable();
        $this->deleteJson('/api/v1/comments/'.$parent)->assertNoContent();
        $this->assertDatabaseCount('comments', 0);
    }

    public function test_embedded_resources_read_comments_from_unified_table_not_payload(): void
    {
        $user = $this->actor();
        $content = Content::create(['title' => 'Unified', 'type' => 'article', 'status' => 'idea', 'owner_id' => $user->id,
            'payload' => ['comments' => [['id' => 'forged', 'text' => 'Legacy payload must not render']]]]);
        $this->postJson('/api/v1/comments', ['subjectType' => 'content', 'subjectId' => $content->id, 'text' => 'Canonical comment'])->assertCreated();

        $this->getJson('/api/v1/contents/'.$content->id)->assertOk()->assertJsonCount(1, 'data.comments')
            ->assertJsonPath('data.comments.0.text', 'Canonical comment');
    }

    private function actor(): User
    {
        $role = Role::create(['key' => 'commenter', 'name' => 'Commenter', 'is_active' => true]);
        foreach (['tasks.view', 'tasks.edit', 'content.view', 'content.edit', 'thinktank.view', 'assets.view', 'assets.edit_info'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }
}
