<?php

namespace Tests\Feature;

use App\Events\ContentPublished;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentPublication;
use App\Services\TaskAutomationProcessor;
use App\Services\TaskOperations;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentPublicationTasksTest extends TestCase
{
    use DatabaseMigrations;

    public $mockConsoleOutput = false;

    public function runDatabaseMigrations(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Isolated SQLite only.');
        }
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$migrated = false);
    }

    private function actor(?array $permissions = null): User
    {
        $permissions ??= ['content.view', 'content.edit', 'content.create', 'content.publish', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.status'];
        $key = 'publication_'.Str::random(10);
        $role = Role::create(['key' => $key, 'name' => 'Publication test', 'is_active' => true]);
        foreach ($permissions as $p) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $p], ['label' => $p, 'category' => 'content']));
        }
        $actor = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $key]);
        Sanctum::actingAs($actor);

        return $actor;
    }

    private function content(User $actor, array $payload = []): Content
    {
        return Content::create(['title' => 'محتوای مشخص', 'type' => 'article', 'status' => 'ready_to_publish', 'owner_id' => $actor->id,
            'payload' => ['publishInfo' => ['status' => 'ready', 'channels' => ['bale']], 'history' => [],
                'stages' => [['id' => 'done-1', 'stageKey' => 'final', 'status' => 'completed']], ...$payload]]);
    }

    private function task(User $actor, ?Content $content = null, string $kind = 'general', ?string $stage = null): Task
    {
        return Task::create(['title' => 'انتشار: محتوای مشخص', 'assignee_id' => $actor->id, 'status' => 'todo', 'priority' => 'medium',
            'content_id' => $content?->id, 'content_stage_id' => $stage, 'kind' => $kind]);
    }

    private function publish(Content $content)
    {
        return $this->postJson('/api/v1/contents/'.$content->id.'/publish', ['expectedVersion' => ContentPublication::version($content)]);
    }

    public function test_publish_click_needs_no_url_and_atomically_completes_only_explicit_related_tasks(): void
    {
        Http::preventStrayRequests();
        $actor = $this->actor();
        $content = $this->content($actor, ['stages' => [['id' => 'publish-1', 'stageKey' => 'publish', 'status' => 'completed'], ['id' => 'write-1', 'stageKey' => 'text_prep', 'status' => 'completed']]]);
        $publication = $this->task($actor, $content, 'content_publish');
        $stage = $this->task($actor, $content, 'content_work', 'publish-1');
        $write = $this->task($actor, $content, 'content_work', 'write-1');
        $manual = $this->task($actor, $content);
        $unrelated = $this->task($actor, $this->content($actor), 'content_publish');
        $this->publish($content)->assertOk()->assertJsonPath('data.content.status', 'published')
            ->assertJsonMissingPath('data.content.publishInfo.publishUrl')->assertJsonMissingPath('data.content.publishInfo.metrics')
            ->assertJsonMissingPath('data.content._publication');
        $this->assertSame('completed', $publication->fresh()->status);
        $this->assertSame('completed', $stage->fresh()->status);
        foreach ([$write, $manual, $unrelated] as $task) {
            $this->assertSame('todo', $task->fresh()->status);
        }
        // Publication records the event without rewriting the already completed workflow.
        $this->assertSame('completed', $content->fresh()->payload['stages'][0]['status']);
        Http::assertNothingSent();
    }

    public function test_repeat_click_and_event_replay_do_not_repeat_history_or_override_later_manual_changes(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $this->publish($content)->assertOk();
        $this->publish($content)->assertOk(); // Same stale client version is safe when already published.
        $this->assertSame(1, ActivityLog::where('type', 'automatic_status_change')->count());
        $this->assertSame(1, ActivityLog::where('type', 'content_published')->count());
        app(TaskOperations::class)->changeStatus($actor, $task, 'in_progress');
        $receipt = $content->fresh()->payload['_publication'];
        event(new ContentPublished($content->id, $actor->id, $receipt['event_id']));
        $this->assertSame('todo', $task->fresh()->status);
        $this->assertSame('ready_to_publish', $content->fresh()->status);
        $this->assertSame(1, ActivityLog::where('type', 'automatic_status_change')->count());
    }

    public function test_processor_failure_rolls_back_source_tasks_audit_and_project_progress_then_retry_succeeds(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $project = Project::create(['name' => 'Project', 'key' => 'PUB', 'status' => 'active', 'progress' => 0]);
        $task->update(['project_id' => $project->id]);
        Event::listen(ContentPublished::class, fn () => throw new \RuntimeException('Injected test failure after task processing'));
        $this->publish($content)->assertStatus(500);
        $this->assertSame('ready_to_publish', $content->fresh()->status);
        $this->assertSame('todo', $task->fresh()->status);
        $this->assertSame(0, $project->fresh()->progress);
        $this->assertDatabaseCount('activity_logs', 0);
        Event::forget(ContentPublished::class);
        Event::listen(ContentPublished::class, [TaskAutomationProcessor::class, 'handle']);
        $this->publish($content)->assertOk();
        $this->assertSame(100, $project->fresh()->progress);
    }

    public function test_a_missing_listener_cannot_claim_success_without_completing_the_transaction(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        Event::forget(ContentPublished::class);
        $this->publish($content)->assertStatus(500);
        $this->assertSame('todo', $task->fresh()->status);
        $this->assertSame('ready_to_publish', $content->fresh()->status);
    }

    public function test_only_active_content_publish_and_view_holders_can_publish(): void
    {
        foreach ([['content.view', 'content.edit', 'tasks.status'], ['content.publish']] as $permissions) {
            $actor = $this->actor($permissions);
            $content = $this->content($actor);
            $task = $this->task($actor, $content, 'content_publish');
            $this->publish($content)->assertForbidden();
            $this->assertSame('todo', $task->fresh()->status);
        }
        $actor = $this->actor();
        $content = $this->content($actor);
        $actor->update(['status' => 'blocked']);
        $this->publish($content)->assertForbidden();
    }

    public function test_publication_does_not_grant_task_visibility_to_the_publisher(): void
    {
        $actor = $this->actor(['content.view', 'content.publish']);
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $this->publish($content)->assertOk()->assertJsonCount(0, 'data.tasks');
        $this->assertSame('completed', $task->fresh()->status);
        $this->getJson('/api/v1/tasks/'.$task->id)->assertForbidden();
    }

    public function test_stale_schedule_or_generic_autosave_cannot_undo_a_successful_publication(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $version = ContentPublication::version($content);
        $this->publish($content)->assertOk();
        $this->putJson('/api/v1/contents/'.$content->id.'/publication-settings', ['expectedVersion' => $version, 'publishInfo' => ['status' => 'ready']])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'ready_to_publish', 'publicationVersion' => $version])->assertConflict();
        $this->assertSame('published', $content->fresh()->status);
    }

    public function test_generic_content_write_cannot_forge_publication_or_receipt(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'published'])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['publishInfo' => ['status' => 'published']])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['_publication' => ['processed' => true]])->assertUnprocessable();
        $this->postJson('/api/v1/contents', ['title' => 'Fake', 'type' => 'article', 'status' => 'published'])->assertConflict();
        $this->assertSame('ready_to_publish', $content->fresh()->status);
    }

    public function test_generic_autosave_cannot_clear_publication_settings_or_change_the_publisher(): void
    {
        $actor = $this->actor();
        $other = User::factory()->create(['status' => 'active']);
        $content = $this->content($actor, ['publisherId' => (string) $actor->id]);
        $this->patchJson('/api/v1/contents/'.$content->id, ['publishInfo' => null])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['publisherId' => $other->id])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['publisherId' => null])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['publicationVersion' => null])->assertConflict();
        $this->assertSame((string) $actor->id, $content->fresh()->payload['publisherId']);
        $this->assertSame('ready', $content->fresh()->payload['publishInfo']['status']);
    }

    public function test_authorized_schedule_can_clear_publisher_and_full_resource_autosave_remains_compatible(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor, ['publisherId' => (string) $actor->id]);
        $saved = $this->putJson('/api/v1/contents/'.$content->id.'/publication-settings', [
            'expectedVersion' => ContentPublication::version($content), 'publisherId' => null,
            'publishInfo' => ['caption' => 'بدون ناشر مشخص'],
        ])->assertOk()->assertJsonPath('data.publisherId', null)->json('data');
        $this->patchJson('/api/v1/contents/'.$content->id, $saved)->assertOk();
        $this->publish($content->fresh())->assertOk();
        $published = $this->getJson('/api/v1/contents/'.$content->id)->assertOk()->json('data');
        $published['title'] = 'ویرایش عنوان پس از انتشار';
        $this->patchJson('/api/v1/contents/'.$content->id, $published)->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertTrue($content->fresh()->payload['_publication']['processed']);
    }

    public function test_task_creation_from_content_reuses_context_and_deduplicates_repeated_requests(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $body = ['expectedVersion' => ContentPublication::version($content), 'assigneeId' => $actor->id];
        $first = $this->postJson('/api/v1/contents/'.$content->id.'/publication-task', $body)->assertCreated()->assertJsonPath('data.kind', 'content_publish')->assertJsonPath('data.contentId', (string) $content->id);
        $this->postJson('/api/v1/contents/'.$content->id.'/publication-task', $body)->assertOk()->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertDatabaseCount('tasks', 1);
        $this->assertSame(0, ActivityLog::where('type', 'task_created')->count());
    }

    public function test_publication_task_is_automatic_and_cannot_exist_before_workflow_completion(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor, ['stages' => [['id' => 'last', 'stageKey' => 'final', 'status' => 'in_progress']]]);
        $this->postJson('/api/v1/contents/'.$content->id.'/publication-task', ['expectedVersion' => ContentPublication::version($content)])
            ->assertConflict();
        $this->assertDatabaseCount('tasks', 0);

        $content->update(['payload' => [...$content->payload, 'stages' => [['id' => 'last', 'stageKey' => 'final', 'status' => 'completed']]]]);
        $task = app(ContentPublication::class)->ensureAutomaticTask($content->fresh());
        $this->assertNotNull($task);
        $this->assertSame(ContentPublication::KIND, $task->kind);
        $this->assertSame($actor->id, $task->assignee_id);
    }

    public function test_general_task_api_cannot_forge_or_rebind_publication_tasks(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $this->postJson('/api/v1/tasks', ['title' => 'Fake', 'kind' => 'content_publish', 'contentId' => $content->id])->assertUnprocessable();
        $this->putJson('/api/v1/tasks/'.$task->id, ['kind' => 'general'])->assertUnprocessable();
        $this->putJson('/api/v1/tasks/'.$task->id, ['contentId' => $this->content($actor)->id])->assertUnprocessable();
        $this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'عنوان دلخواه'])->assertOk();
    }

    public function test_publication_task_completion_and_reopening_synchronize_content_both_ways(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $linked = $this->task($actor, $content, 'content_publish');
        $manual = $this->postJson('/api/v1/tasks', ['title' => 'خرید تجهیزات', 'assigneeId' => $actor->id])->assertCreated()->json('data.id');
        $this->patchJson('/api/v1/tasks/'.$manual.'/status', ['status' => 'completed'])->assertOk();
        $this->assertSame('ready_to_publish', $content->fresh()->status);

        $this->patchJson('/api/v1/tasks/'.$linked->id.'/status', ['status' => 'completed'])->assertOk();
        $this->assertSame('published', $content->fresh()->status);
        $this->patchJson('/api/v1/tasks/'.$linked->id.'/status', ['status' => 'in_progress'])->assertOk();
        $this->assertSame('ready_to_publish', $content->fresh()->status);
        $this->assertSame('todo', $linked->fresh()->status);
    }

    public function test_unpublish_reopens_the_same_automatic_task_and_old_event_replay_is_safe(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $this->publish($content)->assertOk();
        $content->refresh();
        $eventId = $content->payload['_publication']['event_id'];
        $this->postJson('/api/v1/contents/'.$content->id.'/unpublish', ['expectedVersion' => ContentPublication::version($content)])->assertOk();
        $this->assertSame('todo', $task->fresh()->status);
        $content->refresh();
        $this->postJson('/api/v1/contents/'.$content->id.'/publication-task', ['expectedVersion' => ContentPublication::version($content)])
            ->assertOk()->assertJsonPath('data.id', (string) $task->id);
        event(new ContentPublished($content->id, $actor->id, $eventId));
        $this->assertSame('todo', $task->fresh()->status);
        $this->publish($content)->assertOk();
        $this->assertSame('completed', $task->fresh()->status);
    }

    public function test_history_records_actor_source_event_entity_and_status_transition(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor);
        $task = $this->task($actor, $content, 'content_publish');
        $this->publish($content)->assertOk();
        $log = ActivityLog::where('task_id', $task->id)->where('type', 'automatic_status_change')->firstOrFail();
        $meta = json_decode($log->details, true);
        $this->assertSame($actor->id, $log->user_id);
        $this->assertSame('content.published', $meta['event']);
        $this->assertSame('todo', $meta['from']);
        $this->assertSame('completed', $meta['to']);
        $this->assertSame($content->id, $meta['content_id']);
        $this->assertFalse($meta['external_delivery']);
        $this->assertSame($content->fresh()->payload['_publication']['event_id'], $meta['event_id']);
        $this->getJson('/api/v1/tasks/'.$task->id)->assertOk()->assertJsonPath('data.activityHistory.0.type', 'automatic_status_change');
    }

    public function test_metadata_autosave_preserves_archived_publication_and_pending_review_tasks(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor, ['stages' => [['id' => 'pub', 'stageKey' => 'publish', 'status' => 'not_started']]]);
        $archived = $this->task($actor, $content, 'content_work', 'pub');
        $archived->update(['status' => 'archived']);
        $review = $this->task($actor, $content, 'content_review', 'pub');
        $this->patchJson('/api/v1/contents/'.$content->id, ['title' => 'قبل از انتشار'])->assertOk();
        $this->assertSame('archived', $archived->fresh()->status);
        $this->assertSame('todo', $review->fresh()?->status);
        $this->publish($content->fresh())->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['title' => 'هنوز پیش از انتشار'])->assertOk();
        $this->assertSame('archived', $archived->fresh()->status);
        $this->assertSame('todo', $review->fresh()?->status);
    }

    public function test_incomplete_workflow_hides_publication_and_metadata_edit_does_not_complete_its_task(): void
    {
        $actor = $this->actor();
        $content = $this->content($actor, ['stages' => [['id' => 'pub', 'stageKey' => 'publish', 'status' => 'not_started']]]);
        $task = $this->task($actor, $content, 'content_work', 'pub');
        $this->publish($content)->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['title' => 'عنوان جدید'])->assertOk();
        $this->assertSame('backlog', $task->fresh()->status);
        $this->assertSame(0, $task->activityLogs()->where('type', 'automatic_status_change')->count());
    }
}
