<?php

namespace Tests\Feature;

use App\Models\Comment;
use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamDataRow;
use App\Models\DamDataTable;
use App\Models\DamRelation;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\ProjectTemplate;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompletionCommandsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions = ['projects.view', 'projects.create', 'projects.edit', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.status', 'content.view', 'content.edit', 'content.approve']): User
    {
        $role = Role::create(['key' => 'completion', 'name' => 'Completion', 'is_active' => true]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_restore_uses_durable_previous_status_and_is_idempotent(): void
    {
        $actor = $this->actor();
        $project = Project::create(['name' => 'On hold', 'status' => 'on_hold']);
        $task = Task::create(['title' => 'Review', 'status' => 'review', 'assignee_id' => $actor->id]);
        $content = Content::create(['title' => 'Approved', 'type' => 'article', 'status' => 'approved', 'payload' => []]);
        foreach (['projects' => [$project, 'on_hold'], 'tasks' => [$task, 'review'], 'contents' => [$content, 'approved']] as $module => [$record,$before]) {
            $this->patchJson('/api/v1/'.$module.'/'.$record->id, ['status' => 'archived', 'previousStatus' => 'forged'])->assertOk();
            $this->assertSame($before, $record->fresh()->previous_status);
            $this->postJson('/api/v1/'.$module.'/'.$record->id.'/restore')->assertOk()->assertJsonPath('data.status', $before);
            $this->assertNull($record->fresh()->previous_status);
            $this->postJson('/api/v1/'.$module.'/'.$record->id.'/restore')->assertOk()->assertJsonPath('data.status', $before);
        }
    }

    public function test_restore_does_not_grant_access_to_another_users_task(): void
    {
        $user = $this->actor(['tasks.view']);
        $task = Task::create(['title' => 'Other', 'status' => 'todo']);
        $task->update(['status' => 'archived']);
        $this->postJson('/api/v1/tasks/'.$task->id.'/restore')->assertForbidden();
        $this->assertSame('archived', $task->fresh()->status);
        $this->getJson('/api/v1/tasks?content_id=not-an-id')->assertUnprocessable();
    }

    public function test_rejection_creates_one_linked_correction_per_cycle_without_reopening_history(): void
    {
        $actor = $this->actor();
        $stage = ['id' => 'review', 'title' => 'Quality', 'status' => 'pending_approval', 'assigneeId' => (string) $actor->id, 'reviewerId' => (string) $actor->id];
        $content = Content::create(['title' => 'Article', 'type' => 'article', 'status' => 'in_progress', 'payload' => ['stages' => [$stage]]]);
        app(ContentStageTaskSync::class)->sync($content);
        $work = Task::where('content_id', $content->id)->where('kind', 'content_work')->firstOrFail();
        $work->update(['status' => 'completed']);
        $oldReview = Task::where('content_id', $content->id)->where('kind', 'content_review')->firstOrFail();
        $url = '/api/v1/contents/'.$content->id.'/stages/review/decision';
        $version = ContentReview::version($content);
        $this->postJson($url, ['decision' => 'reject', 'note' => 'Correct the sources', 'expectedVersion' => $version])->assertOk();
        $correction = Task::where('kind', 'content_correction')->firstOrFail();
        $this->assertEquals($work->id, $correction->parent_task_id);
        $this->assertSame('Correct the sources', $correction->description);
        $this->assertSame('completed', $work->fresh()->status);
        $this->assertSame('completed', $oldReview->fresh()->status);
        $this->postJson($url, ['decision' => 'reject', 'note' => 'Again', 'expectedVersion' => $version])->assertConflict();
        $this->assertSame(1, Task::where('kind', 'content_correction')->count());
        $this->assertSame(1, DomainRecord::where('domain', 'notification')->where('payload->linkTaskId', (string) $correction->id)->count());
        // Start and submit another real correction cycle through existing content update.
        $stage = $content->fresh()->payload['stages'][0];
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'status' => 'in_progress']]])->assertOk();
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'status' => 'pending_approval']]])->assertOk();
        $this->assertSame('completed', $oldReview->fresh()->status);
        $this->assertSame(2, Task::where('kind', 'content_review')->count());
        $this->getJson('/api/v1/approvals')->assertOk()->assertJsonPath('meta.total', 1);
        $correction->update(['status' => 'completed']);
        $this->postJson($url, ['decision' => 'reject', 'note' => 'Second revision', 'expectedVersion' => ContentReview::version($content->fresh())])->assertOk();
        $next = Task::where('kind', 'content_correction')->latest('id')->firstOrFail();
        $this->assertEquals($correction->id, $next->parent_task_id);
        $this->assertSame('completed', $correction->fresh()->status);
        $this->postJson('/api/v1/tasks', ['title' => 'Forge', 'kind' => 'content_correction'])->assertUnprocessable();
        $this->getJson('/api/v1/tasks?content_id='.$content->id.'&per_page=1&page=2')->assertOk()->assertJsonPath('meta.total', 5)->assertJsonCount(1, 'data');
    }

    private function template(): ProjectTemplate
    {
        return ProjectTemplate::create(['name' => 'Real template', 'tasks' => [
            ['title' => 'First', 'relativeDueDays' => 0, 'subtasks' => ['Verify source']],
            ['title' => 'Second', 'relativeDueDays' => 2],
        ]]);
    }

    public function test_template_project_tasks_checklists_and_notifications_commit_together(): void
    {
        $actor = $this->actor();
        $template = $this->template();
        $this->postJson('/api/v1/projects', ['name' => 'Atomic', 'templateId' => $template->id, 'projectManagerId' => (string) $actor->id, 'startDate' => '2026-09-29'])->assertCreated();
        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseCount('tasks', 2);
        $this->assertSame(2, DomainRecord::where('domain', 'notification')->count());
        $task = Task::where('title', 'First')->firstOrFail();
        $this->assertSame('2026-09-29', $task->deadline->toDateString());
        $this->getJson('/api/v1/tasks/'.$task->id)->assertOk()->assertJsonPath('data.subtasks.0.title', 'Verify source');
        $checklist = $task->subtasks;
        $checklist[0]['completed'] = true;
        $this->patchJson('/api/v1/tasks/'.$task->id, ['subtasks' => $checklist])->assertOk();
        $this->getJson('/api/v1/tasks/'.$task->id)->assertJsonPath('data.subtasks.0.completed', true);
        $this->postJson('/api/v1/tasks/'.$task->id.'/comments', ['text' => 'Durable comment'])->assertOk()->assertJsonPath('data.comments.0.text', 'Durable comment');
        $this->getJson('/api/v1/tasks/'.$task->id)->assertJsonPath('data.comments.0.userId', (string) $actor->id);
        $this->postJson('/api/v1/projects', ['name' => 'Duplicate', 'templateId' => $template->id])->assertUnprocessable();
        $this->assertDatabaseCount('tasks', 2);
    }

    public function test_second_task_failure_rolls_back_project_first_task_and_notification(): void
    {
        $actor = $this->actor();
        $template = $this->template();
        Event::listen('eloquent.creating: '.Task::class, function (Task $task) {
            if ($task->title === 'Second') {
                throw ValidationException::withMessages(['tasks' => 'Simulated storage validation failure']);
            }
        });
        $this->postJson('/api/v1/projects', ['name' => 'Rollback', 'templateId' => $template->id, 'projectManagerId' => $actor->id])->assertUnprocessable();
        $this->assertDatabaseCount('projects', 0);
        $this->assertDatabaseCount('tasks', 0);
        $this->assertSame(0, DomainRecord::where('domain', 'notification')->count());
    }

    public function test_template_requires_task_creation_permission_and_validates_all_children(): void
    {
        $actor = $this->actor(['projects.create']);
        $template = $this->template();
        $this->postJson('/api/v1/projects', ['name' => 'Denied', 'templateId' => $template->id])->assertForbidden();
        $this->assertDatabaseCount('projects', 0);
        $template->update(['tasks' => [['title' => 'Valid'], ['title' => 'Bad', 'status' => 'invented']]]);
        $this->postJson('/api/v1/projects', ['name' => 'Invalid', 'templateId' => $template->id])->assertUnprocessable();
        $this->assertDatabaseCount('projects', 0);
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_generic_content_history_is_server_authored_and_stale_stages_are_rejected(): void
    {
        $actor = $this->actor();
        $stage = ['id' => 'write', 'status' => 'in_progress', 'title' => 'Original'];
        $content = Content::create(['title' => 'Real', 'type' => 'article', 'status' => 'in_progress', 'payload' => ['stages' => [$stage], 'history' => []]]);
        $old = ContentReview::version($content);
        $this->patchJson('/api/v1/contents/'.$content->id, ['history' => [['userId' => '999', 'action' => 'Fake']], 'stages' => [[...$stage, 'title' => 'Updated', 'activityLog' => [['userId' => '999']]]], 'reviewVersion' => $old])
            ->assertOk()->assertJsonPath('data.history.0.userId', (string) $actor->id)->assertJsonPath('data.stages.0.activityLog.0.userId', (string) $actor->id)->assertDontSee('Fake');
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [$stage], 'reviewVersion' => $old])->assertConflict();
        $this->assertSame('Updated', $content->fresh()->payload['stages'][0]['title']);
    }

    public function test_review_queue_crosses_chunks_without_exposing_stale_assignments(): void
    {
        $actor = $this->actor();
        $content = Content::create(['title' => 'Large queue', 'type' => 'article', 'status' => 'in_progress', 'payload' => ['stages' => [
            ['id' => 'valid', 'status' => 'pending_approval', 'reviewerId' => (string) $actor->id],
            ['id' => 'other', 'status' => 'pending_approval', 'reviewerId' => '999'],
        ]]]);
        for ($i = 0; $i < 425; $i++) {
            Task::create(['title' => 'Review', 'kind' => 'content_review', 'content_id' => $content->id, 'content_stage_id' => $i < 15 ? 'other' : 'valid', 'assignee_id' => $actor->id, 'status' => 'todo']);
        }
        $this->getJson('/api/v1/approvals?page=5&per_page=100')->assertOk()->assertJsonPath('meta.total', 410)->assertJsonPath('meta.last_page', 5)->assertJsonCount(10, 'data');
        $this->getJson('/api/v1/approvals?page=2&per_page=100')->assertOk()->assertJsonCount(100, 'data')->assertJsonPath('data.0.stageId', 'valid');
    }

    public function test_activity_notes_cannot_forge_a_server_event_or_read_private_history(): void
    {
        $actor = $this->actor(['tasks.view']);
        $this->getJson('/api/v1/activity-logs')->assertForbidden();
        $this->postJson('/api/v1/activity-logs', ['action' => 'Claimed approval', 'userId' => '999', 'type' => 'automatic_status_change'])
            ->assertCreated()->assertJsonPath('data.type', 'client_note')->assertJsonPath('data.userId', (string) $actor->id);
        $project = Project::create(['name' => 'Private', 'status' => 'active']);
        $this->postJson('/api/v1/activity-logs', ['action' => 'Read project', 'projectId' => $project->id])->assertForbidden();
    }

    public function test_department_members_can_edit_only_their_content_without_role_edit_and_revocation_is_live(): void
    {
        $actor = $this->actor([]);
        $one = Department::create(['name' => 'Member department', 'status' => 'active']);
        $two = Department::create(['name' => 'Other department', 'status' => 'active']);
        $one->members()->attach($actor);
        $mine = Content::create(['title' => 'Mine', 'type' => 'article', 'status' => 'in_progress', 'payload' => ['departmentId' => $one->id]]);
        $migrated = Content::create(['title' => 'Migrated membership', 'type' => 'article', 'status' => 'idea', 'payload' => ['departmentIds' => [(string) $one->id]]]);
        $other = Content::create(['title' => 'Private department', 'type' => 'article', 'status' => 'idea', 'payload' => ['departmentId' => (string) $two->id]]);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.contentMembershipAccess', true);
        $this->getJson('/api/v1/contents?per_page=1')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/contents/'.$mine->id)->assertOk()->assertJsonPath('data.access.edit', true);
        $this->patchJson('/api/v1/contents/'.$mine->id, ['title' => 'Edited by membership'])->assertOk();
        $this->patchJson('/api/v1/contents/'.$migrated->id, ['description' => 'Still allowed after team conversion'])->assertOk();
        $this->getJson('/api/v1/contents/'.$other->id)->assertForbidden();
        $this->patchJson('/api/v1/contents/'.$other->id, ['title' => 'Denied'])->assertForbidden();
        $this->patchJson('/api/v1/contents/'.$mine->id, ['departmentId' => (string) $two->id])->assertForbidden();
        $this->deleteJson('/api/v1/contents/'.$mine->id)->assertForbidden();
        $this->postJson('/api/v1/contents/'.$mine->id.'/publish', ['expectedVersion' => str_repeat('a', 64)])->assertForbidden();
        $this->getJson('/api/v1/approvals')->assertForbidden();
        $notice = DomainRecord::create(['domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $actor->id, 'payload' => ['userId' => (string) $actor->id, 'title' => 'Department notice', 'type' => 'system', 'read' => false, 'linkContentId' => (string) $mine->id]]);
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('meta.total', 1);
        $this->patchJson('/api/v1/contents/'.$mine->id, ['status' => 'archived'])->assertOk();
        $this->postJson('/api/v1/contents/'.$mine->id.'/restore')->assertOk()->assertJsonPath('data.status', 'in_progress');
        $one->members()->detach($actor);
        $this->getJson('/api/v1/contents')->assertForbidden();
        $this->patchJson('/api/v1/contents/'.$mine->id, ['title' => 'Revoked'])->assertForbidden();
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('meta.total', 0);
        $this->putJson('/api/v1/notifications/'.$notice->id, ['read' => true])->assertForbidden();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.contentMembershipAccess', false);
        // Primary-department membership is equivalent, but inactive departments are not.
        $actor->update(['department_id' => $one->id]);
        $this->getJson('/api/v1/contents/'.$mine->id)->assertOk();
        $one->update(['status' => 'inactive']);
        $this->getJson('/api/v1/contents/'.$mine->id)->assertForbidden();
    }

    public function test_comment_authorship_and_smart_task_source_cannot_be_forged(): void
    {
        $actor = $this->actor();
        $content = Content::create(['title' => 'History', 'type' => 'article', 'status' => 'idea', 'payload' => []]);
        Comment::create(['subject_type' => 'content', 'subject_id' => $content->id, 'user_id' => $actor->id, 'body' => 'Keep history']);
        $comments = [['id' => 'old', 'userId' => '99', 'text' => 'Forged replacement']];
        $this->patchJson('/api/v1/contents/'.$content->id, ['comments' => $comments])->assertOk()
            ->assertJsonCount(1, 'data.comments')->assertJsonPath('data.comments.0.text', 'Keep history')
            ->assertJsonPath('data.comments.0.userId', (string) $actor->id);
        $this->postJson('/api/v1/comments', ['subjectType' => 'content', 'subjectId' => $content->id, 'text' => 'New note', 'userId' => 99, 'createdAt' => '2000-01-01'])
            ->assertCreated()->assertJsonPath('data.userId', (string) $actor->id)->assertJsonPath('data.text', 'New note');
        $this->assertDatabaseCount('comments', 2);
        $this->postJson('/api/v1/tasks', ['title' => 'Forged workflow task', 'kind' => 'content_work', 'contentId' => $content->id])->assertUnprocessable();
        $task = Task::create(['title' => 'Manual', 'assignee_id' => $actor->id]);
        $this->patchJson('/api/v1/tasks/'.$task->id, ['kind' => 'content_work', 'contentId' => $content->id])->assertUnprocessable();
    }

    public function test_own_progress_exception_does_not_grant_editing_or_reassignment(): void
    {
        $actor = $this->actor(['tasks.view']);
        $mine = Task::create(['title' => 'Mine', 'assignee_id' => $actor->id, 'status' => 'todo', 'subtasks' => []]);
        $other = Task::create(['title' => 'Other', 'status' => 'todo', 'subtasks' => []]);
        $check = [['id' => 'one', 'title' => 'Check', 'completed' => true]];
        $this->patchJson('/api/v1/tasks/'.$mine->id, ['subtasks' => $check, 'title' => 'Sneak edit'])->assertForbidden();
        $this->assertSame([], $mine->fresh()->subtasks);
        $this->patchJson('/api/v1/tasks/'.$mine->id, ['subtasks' => $check, 'status' => 'in_progress'])->assertOk()->assertJsonPath('data.subtasks.0.completed', true);
        $this->patchJson('/api/v1/tasks/'.$other->id, ['subtasks' => $check])->assertForbidden();
        $this->patchJson('/api/v1/tasks/'.$mine->id, ['assigneeId' => null])->assertForbidden();
    }

    public function test_task_table_rows_page_after_real_table_acl_not_a_truncated_projection(): void
    {
        $actor = $this->actor(['assets.view', 'assets.edit_info', 'tasks.view']);
        $other = User::factory()->create();
        $task = Task::create(['title' => 'Rows task', 'assignee_id' => $actor->id]);
        $source = Content::create(['title' => 'Private source title', 'type' => 'article', 'status' => 'idea', 'payload' => []]);
        $open = DamDataTable::create(['name' => 'Allowed', 'created_by' => $actor->id, 'columns' => [], 'grants' => []]);
        $private = DamDataTable::create(['name' => 'Private table', 'created_by' => $other->id, 'columns' => [], 'grants' => [['type' => 'user', 'id' => $other->id, 'access' => 'view']]]);
        for ($i = 0; $i < 225; $i++) {
            DamDataRow::create(['table_id' => $i % 15 === 0 ? $private->id : $open->id, 'task_id' => $task->id, 'content_id' => $source->id, 'cells' => ['value' => 'Row '.$i], 'position' => $i, 'created_by' => $other->id]);
        }
        $this->getJson('/api/v1/dam/data-tables/rows-by-task?task_id='.$task->id.'&per_page=100&page=3')->assertOk()
            ->assertJsonPath('meta.total', 210)->assertJsonPath('meta.last_page', 3)->assertJsonCount(10, 'data')
            ->assertJsonPath('data.0.can_edit', true)->assertJsonPath('data.0.content', null)->assertDontSee('Private source title')->assertDontSee('Private table');
        $this->getJson('/api/v1/dam/data-tables/rows-by-task?task_id='.$task->id.'&per_page=201')->assertUnprocessable();
        $this->getJson('/api/v1/dam/library?page=-1')->assertUnprocessable();
    }

    public function test_unlinking_keeps_other_relations_and_legacy_attachment_deletion_is_scoped(): void
    {
        $actor = $this->actor(['assets.view', 'assets.edit_info', 'tasks.view']);
        $task = Task::create(['title' => 'My task', 'assignee_id' => $actor->id]);
        $other = Task::create(['title' => 'Other task']);
        $attachment = $task->attachments()->create(['name' => 'Old note', 'size' => '10', 'type' => 'text', 'url' => '#', 'uploaded_by' => $actor->id]);
        $foreign = $other->attachments()->create(['name' => 'Other note', 'size' => '10', 'type' => 'text', 'url' => '#', 'uploaded_by' => $actor->id]);
        $this->deleteJson('/api/v1/tasks/'.$task->id.'/attachments/'.$foreign->id)->assertNotFound();
        $this->deleteJson('/api/v1/tasks/'.$task->id.'/attachments/'.$attachment->id)->assertOk()->assertJsonCount(0, 'data.attachments');
        $this->assertDatabaseHas('task_attachments', ['id' => $foreign->id]);
        $asset = DamAsset::create(['created_by' => $actor->id, 'title' => 'Shared asset', 'type' => 'content', 'status' => 'draft', 'confidentiality' => 'internal', 'owner_id' => $actor->id]);
        foreach ([$task, $other] as $item) {
            $asset->relations()->create(['related_type' => 'task', 'related_id' => $item->id, 'relation_type' => 'attachment', 'created_by' => $actor->id]);
        }
        $this->deleteJson('/api/v1/dam/library/'.$asset->id.'/tasks/'.$task->id)->assertOk();
        $this->deleteJson('/api/v1/dam/library/'.$asset->id.'/tasks/'.$task->id)->assertOk();
        $this->assertNull($asset->fresh()->deleted_at);
        $this->assertSame(1, $asset->relations()->count());
        $this->assertSame(1, $asset->activities()->where('action', 'detached')->count());
        $this->getJson('/api/v1/dam/library/'.$asset->id)->assertOk()->assertJsonMissingPath('data.owner.email');
    }

    public function test_confidential_asset_grants_use_the_active_role_not_display_role_key(): void
    {
        $actor = $this->actor(['assets.view']);
        $actor->update(['role_key' => 'admin']);
        $asset = DamAsset::create(['created_by' => $actor->id, 'title' => 'Restricted', 'type' => 'content', 'status' => 'draft', 'confidentiality' => 'confidential', 'access_grants' => ['roles' => ['admin']], 'owner_id' => User::factory()->create()->id]);
        $this->getJson('/api/v1/dam/library/'.$asset->id)->assertForbidden();
        $this->getJson('/api/v1/dam/library')->assertOk()->assertJsonPath('total', 0);
    }

    public function test_partial_role_permission_write_preserves_metadata_and_enforces_delegation_ceiling(): void
    {
        $actor = $this->actor(['roles.view', 'roles.manage_permissions', 'projects.view']);
        $role = Role::create(['key' => 'editable_custom', 'name' => 'Preserved name', 'is_active' => true]);
        $this->putJson('/api/v1/roles/'.$role->id, ['permissions' => ['projects.view']])->assertOk()
            ->assertJsonPath('data.name', 'Preserved name')->assertJsonPath('data.permissions.0', 'projects.view');
        $this->putJson('/api/v1/roles/'.$role->id, ['name' => 'Not allowed'])->assertForbidden();
        Permission::firstOrCreate(['key' => 'tasks.delete'], ['label' => 'Delete', 'category' => 'tasks']);
        $this->putJson('/api/v1/roles/'.$role->id, ['permissions' => ['tasks.delete']])->assertForbidden();
        $this->assertSame(['projects.view'], $role->fresh()->permissions->pluck('key')->all());
        $actor->role->permissions()->attach(Permission::firstOrCreate(['key' => 'roles.edit'], ['label' => 'Edit role', 'category' => 'roles'])->id);
        Sanctum::actingAs($actor->fresh());
        $this->putJson('/api/v1/roles/'.$role->id, ['isActive' => false])->assertOk()
            ->assertJsonPath('data.isActive', false)->assertJsonPath('data.name', 'Preserved name')->assertJsonPath('data.key', 'editable_custom');
        $this->assertSame(['projects.view'], $role->fresh()->permissions->pluck('key')->all());
    }

    public function test_role_permission_matrix_is_saved_in_one_atomic_batch(): void
    {
        $this->actor(['roles.view', 'roles.manage_permissions', 'projects.view', 'tasks.view']);
        $projectPermission = Permission::where('key', 'projects.view')->firstOrFail();
        $taskPermission = Permission::where('key', 'tasks.view')->firstOrFail();
        $first = Role::create(['key' => 'batch_first', 'name' => 'Batch first', 'is_active' => true]);
        $second = Role::create(['key' => 'batch_second', 'name' => 'Batch second', 'is_active' => true]);
        $first->permissions()->sync([$projectPermission->id]);
        $second->permissions()->sync([$projectPermission->id]);

        $this->putJson('/api/v1/roles/permissions', ['roles' => [
            ['id' => $first->id, 'permissions' => ['tasks.view']],
            ['id' => $second->id, 'permissions' => ['projects.view', 'tasks.view']],
        ]])->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame(['tasks.view'], $first->fresh()->permissions->pluck('key')->sort()->values()->all());
        $this->assertSame(['projects.view', 'tasks.view'], $second->fresh()->permissions->pluck('key')->sort()->values()->all());

        Permission::firstOrCreate(['key' => 'tasks.delete'], ['label' => 'Delete', 'category' => 'tasks']);
        $this->putJson('/api/v1/roles/permissions', ['roles' => [
            ['id' => $first->id, 'permissions' => ['projects.view']],
            ['id' => $second->id, 'permissions' => ['tasks.delete']],
        ]])->assertForbidden();

        // The valid first row must not leak through when a later row is rejected.
        $this->assertSame(['tasks.view'], $first->fresh()->permissions->pluck('key')->sort()->values()->all());
        $this->assertSame(['projects.view', 'tasks.view'], $second->fresh()->permissions->pluck('key')->sort()->values()->all());
        $this->assertSame($taskPermission->id, Permission::where('key', 'tasks.view')->value('id'));
    }

    public function test_module_catalogues_do_not_bypass_their_view_permissions(): void
    {
        $this->actor([]);
        foreach (['roles', 'departments', 'project-templates'] as $module) {
            $this->getJson('/api/v1/'.$module)->assertForbidden();
        }
    }

    public function test_content_asset_is_created_with_its_authorized_source_or_not_created_at_all(): void
    {
        $actor = $this->actor(['assets.view', 'assets.upload', 'content.view']);
        $content = Content::create(['title' => 'Source', 'type' => 'article', 'status' => 'draft', 'payload' => []]);
        $payload = ['title' => 'Stage output', 'body' => 'Durable text', 'content_id' => $content->id];
        $created = $this->postJson('/api/v1/dam/library', $payload)->assertCreated()
            ->assertJsonPath('data.relations.0.related_type', 'content')->assertJsonPath('data.relations.0.related_id', $content->id);
        $this->getJson('/api/v1/dam/library?content_id='.$content->id)->assertOk()->assertJsonPath('total', 1);
        Event::listen('eloquent.creating: '.DamRelation::class, function () {
            throw ValidationException::withMessages(['content_id' => 'Relation failed']);
        });
        $this->postJson('/api/v1/dam/library', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('dam_assets', 1);
        Event::forget('eloquent.creating: '.DamRelation::class);
        $actor->role->permissions()->detach(Permission::where('key', 'content.view')->value('id'));
        Sanctum::actingAs($actor->fresh());
        $this->postJson('/api/v1/dam/library', $payload)->assertForbidden();
        $this->assertDatabaseCount('dam_assets', 1);
    }
}
