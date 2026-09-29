<?php

namespace Tests\Feature;

use App\Bot\Bale\Notifications\NotificationAccess;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhaseTwoWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions = ['projects.view', 'tasks.view', 'content.view']): User
    {
        $role = Role::create(['key' => 'phase2', 'name' => 'Phase 2', 'is_active' => true]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_list_query_validation_pagination_filter_and_sort(): void
    {
        $user = $this->actor();
        for ($i = 1; $i <= 3; $i++) {
            Project::create(['name' => 'Project '.$i, 'key' => 'PH'.$i, 'status' => 'active', 'deadline' => "2026-10-0{$i}"]);
        }
        $this->getJson('/api/v1/projects?status=active&per_page=1&page=2&sort=deadline&direction=asc')
            ->assertOk()->assertJsonPath('meta.total', 3)->assertJsonPath('meta.current_page', 2)->assertJsonPath('data.0.name', 'Project 2');
        foreach (['page=0', 'page=no', 'per_page=1000', 'sort=password', 'direction=drop', 'status=bad', 'assignee=me', 'unknown=filter'] as $query) {
            $this->getJson('/api/v1/projects?'.$query)->assertUnprocessable()->assertJsonStructure(['message', 'errors']);
        }
        Project::create(['name' => 'Past due', 'key' => 'LATE', 'status' => 'active', 'project_manager_id' => $user->id, 'deadline' => today()->subDay()]);
        Project::create(['name' => 'Completed project', 'key' => 'DONE', 'status' => 'completed', 'project_manager_id' => $user->id, 'deadline' => today()->subDay()]);
        $this->getJson('/api/v1/projects?project_manager_id='.$user->id.'&due=overdue')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Past due');
        Task::create(['title' => 'Mine overdue', 'assignee_id' => $user->id, 'status' => 'todo', 'deadline' => today()->subDay()]);
        Task::create(['title' => 'Other', 'status' => 'todo', 'deadline' => today()->subDay()]);
        Task::create(['title' => 'Completed', 'assignee_id' => $user->id, 'status' => 'completed', 'deadline' => today()->subDay()]);
        $this->getJson('/api/v1/tasks?assignee=me&due=overdue')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Mine overdue');
        Content::create(['title' => 'Mine content', 'type' => 'article', 'payload' => [], 'status' => 'reviewing', 'owner_id' => $user->id]);
        Content::create(['title' => 'Other content', 'type' => 'article', 'payload' => [], 'status' => 'reviewing']);
        $this->getJson('/api/v1/contents?owner=me&status=reviewing')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_notifications_are_scoped_before_pagination_and_read_all(): void
    {
        $user = $this->actor();
        $other = User::factory()->create();
        $visible = DomainRecord::create(['domain' => 'notification', 'user_id' => $user->id, 'payload' => ['title' => 'Visible', 'type' => 'system', 'read' => false]]);
        $private = DomainRecord::create(['domain' => 'notification', 'user_id' => $other->id, 'payload' => ['title' => 'Private', 'read' => false]]);
        $task = Task::create(['title' => 'Foreign task', 'status' => 'todo', 'assignee_id' => $other->id]);
        $hidden = DomainRecord::create(['domain' => 'notification', 'user_id' => $user->id, 'payload' => ['title' => 'Forbidden destination', 'read' => false, 'linkTaskId' => (string) $task->id]]);
        $this->getJson('/api/v1/notifications?per_page=1')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('meta.unread_count', 1)->assertJsonPath('data.0.title', 'Visible')->assertDontSee('Forbidden destination');
        $this->putJson('/api/v1/notifications/'.$hidden->id, ['read' => true])->assertForbidden();
        $this->putJson('/api/v1/notifications/'.$private->id, ['read' => true])->assertForbidden();
        $this->postJson('/api/v1/notifications/read-all')->assertOk()->assertJsonPath('data.updated', 1);
        $this->assertTrue($visible->fresh()->payload['read']);
        $this->assertFalse($private->fresh()->payload['read']);
        $this->assertFalse($hidden->fresh()->payload['read']);
        $this->getJson('/api/v1/notifications?read=unread')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);
        $this->postJson('/api/v1/notifications/read-all')->assertOk()->assertJsonPath('data.updated', 0);
    }

    public function test_authentication_and_module_permissions_are_required(): void
    {
        $this->getJson('/api/v1/tasks?assignee=me')->assertUnauthorized();
        $this->postJson('/api/v1/notifications/read-all')->assertUnauthorized();
        $this->actor([]);
        foreach (['projects', 'tasks', 'contents'] as $module) {
            $this->getJson('/api/v1/'.$module)->assertForbidden();
        }
    }

    public function test_review_queue_and_command_are_authorized_versioned_and_not_generic_patches(): void
    {
        $user = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view', 'tasks.status']);
        $other = User::factory()->create(['status' => 'active', 'role_id' => $user->role_id, 'role_key' => $user->role_key]);
        $stage = ['id' => 'review-stage', 'title' => 'Review', 'status' => 'pending_approval', 'reviewerId' => (string) $user->id];
        $content = Content::create(['title' => 'Reviewable', 'type' => 'article', 'status' => 'in_progress', 'owner_id' => $other->id, 'payload' => ['stages' => [$stage]]]);
        app(ContentStageTaskSync::class)->sync($content);
        $queue = $this->getJson('/api/v1/approvals')->assertOk()->assertJsonPath('meta.total', 1)->json('data.0');
        $version = $queue['expectedVersion'];
        $url = '/api/v1/contents/'.$content->id.'/stages/review-stage/decision';
        $this->postJson($url, ['decision' => 'reject', 'expectedVersion' => $version])->assertUnprocessable()->assertJsonValidationErrors('note');
        $this->postJson($url, ['decision' => 'approve', 'expectedVersion' => str_repeat('0', 64)])->assertStatus(409);
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'status' => 'approved']]])->assertUnprocessable();
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'status' => 'invalid']]])->assertUnprocessable();
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => ['alias' => $stage]])->assertUnprocessable();
        $this->patchJson('/api/v1/tasks/'.$queue['id'].'/status', ['status' => 'completed'])->assertUnprocessable();
        Sanctum::actingAs($other);
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'reviewerId' => (string) $other->id]]])->assertForbidden();
        $this->patchJson('/api/v1/contents/'.$content->id, ['ownerId' => (string) $user->id])->assertForbidden();
        $this->getJson('/api/v1/approvals')->assertOk()->assertJsonPath('meta.total', 0);
        $this->postJson($url, ['decision' => 'approve', 'expectedVersion' => $version])->assertForbidden();
        Sanctum::actingAs($user);
        $this->postJson($url, ['decision' => 'approve', 'expectedVersion' => $version])->assertOk()->assertJsonPath('data.stages.0.status', 'approved')->assertJsonPath('data.stages.0.approvedBy', (string) $user->id);
        $this->getJson('/api/v1/approvals')->assertOk()->assertJsonPath('meta.total', 0);
        $this->postJson($url, ['decision' => 'approve', 'expectedVersion' => $version])->assertStatus(409);
        $this->assertCount(1, $content->fresh()->payload['history']);
        $this->postJson('/api/v1/contents/'.$content->id.'/stages/missing/decision', ['decision' => 'approve', 'expectedVersion' => $version])->assertNotFound();
    }

    public function test_rejection_keeps_completed_work_and_cannot_expose_foreign_or_stale_queue_rows(): void
    {
        $user = $this->actor(['content.view', 'content.approve']);
        $stage = ['id' => 's', 'title' => 'Review', 'status' => 'ready_for_review', 'reviewerId' => (string) $user->id];
        $content = Content::create(['title' => 'Revision', 'type' => 'article', 'status' => 'in_progress', 'payload' => ['stages' => [$stage]]]);
        app(ContentStageTaskSync::class)->sync($content);
        $work = Task::where('content_id', $content->id)->where('kind', 'content_work')->firstOrFail();
        $work->update(['status' => 'completed']);
        $this->postJson('/api/v1/contents/'.$content->id.'/stages/s/decision', ['decision' => 'reject', 'note' => 'Please correct', 'expectedVersion' => ContentReview::version($content)])
            ->assertOk()->assertJsonPath('data.stages.0.rejectionReason', 'Please correct');
        app(ContentStageTaskSync::class)->sync($content->fresh());
        $this->assertSame('completed', $work->fresh()->status);
        Task::where('content_id', $content->id)->where('kind', 'content_review')->update(['status' => 'todo']); // stale legacy row
        $this->getJson('/api/v1/approvals')->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 0);
    }

    public function test_notification_primary_subject_scope_matches_existing_recipient_access(): void
    {
        $user = $this->actor(['tasks.view', 'content.view']);
        $project = Project::create(['name' => 'Context', 'key' => 'CTX', 'status' => 'active']);
        $task = Task::create(['title' => 'Assigned', 'status' => 'todo', 'assignee_id' => $user->id, 'project_id' => $project->id]);
        $content = Content::create(['title' => 'Accessible', 'type' => 'article', 'status' => 'idea', 'payload' => ['creatorIds' => [(string) $user->id]]]);
        foreach ([['linkTaskId' => (string) $task->id, 'linkProjectId' => (string) $project->id], ['linkContentId' => (string) $content->id]] as $links) {
            $row = DomainRecord::create(['domain' => 'notification', 'user_id' => $user->id, 'payload' => [...$links, 'read' => false, 'type' => 'assignment']]);
            $this->assertTrue(app(NotificationAccess::class)->canRead($user, $row));
        }
        $this->getJson('/api/v1/notifications?per_page=1')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.unread_count', 2)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/notifications?page=2&per_page=1&type=assignment')->assertOk()->assertJsonPath('meta.current_page', 2)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/notifications?per_page=201')->assertUnprocessable();
    }
}
