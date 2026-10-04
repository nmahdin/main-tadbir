<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\DamAsset;
use App\Models\DamRelation;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use App\Services\ContentWatchNotifier;
use App\Services\IntegrityDiagnostics;
use App\Services\PlannedOccurrenceActivator;
use App\Services\ProjectProgress;
use App\Services\SeriesOccurrenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** End-to-end contract for Series and the Project operations center. */
class SeriesProjectOperationsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private const ALL_PERMISSIONS = [
        'content.view', 'content.create', 'content.edit', 'content.delete', 'content.watch', 'content.approve',
        'content.publish', 'content.workflow.manage', 'projects.view', 'projects.edit', 'projects.delete', 'projects.create',
        'tasks.view', 'tasks.create', 'assets.view', 'thinktank.view', 'thinktank.create_idea', 'thinktank.edit_idea',
        'meetings.view', 'meetings.create', 'meetings.edit', 'reports.view', 'integrity.view',
    ];

    private function actor(array $permissions = [], string $roleKey = 'admin'): User
    {
        $role = Role::create(['key' => $roleKey.'_'.bin2hex(random_bytes(3)), 'name' => $roleKey, 'is_active' => true]);
        if ($roleKey === 'admin') $role->key = 'admin';
        $role->save();
        foreach ($permissions ?: self::ALL_PERMISSIONS as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);
        return $user;
    }

    private function project(User $manager): Project
    {
        $project = Project::create(['name' => 'Campaign', 'project_manager_id' => $manager->id, 'status' => 'active',
            'priority' => 'high', 'tags' => [], 'start_date' => '2026-10-01', 'deadline' => '2026-12-01']);
        $project->members()->sync([$manager->id]);
        return $project;
    }

    private function seriesPayload(?Project $project = null, array $override = []): array
    {
        return [...[
            'name' => 'Weekly editorial', 'description' => 'Independent weekly units', 'codePrefix' => 'WE',
            'contentType' => 'article', 'projectId' => $project?->id, 'recurrenceType' => 'weekly',
            'recurrenceConfig' => ['startDate' => '2026-10-05', 'interval' => 1, 'deadlineOffsetDays' => 3],
            'defaultContentPayload' => ['tags' => ['editorial'], 'assetIds' => [], 'stages' => [$this->stage('write')]],
        ], ...$override];
    }

    private function stage(string $id, array $override = []): array
    {
        return [...[
            'id' => $id, 'stageKey' => $id, 'title' => 'Write', 'description' => '', 'departmentId' => '',
            'departmentName' => '', 'order' => 1, 'relativeDueDays' => 2, 'status' => 'not_started',
            'reviewRequired' => false, 'assigneeId' => null, 'inputs' => [], 'outputs' => [],
            'checklist' => [['text' => 'Check facts'], ['text' => 'Check spelling']],
        ], ...$override];
    }

    private function createSeries(User $actor, ?Project $project = null, array $override = []): ContentSeries
    {
        Sanctum::actingAs($actor);
        $id = $this->postJson('/api/v1/content-series', $this->seriesPayload($project, $override))
            ->assertCreated()->json('data.id');
        return ContentSeries::findOrFail($id);
    }

    public function test_series_creation_snapshots_configuration_and_project(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        $series = $this->createSeries($actor, $project);
        $this->assertSame($project->id, $series->project_id);
        $this->assertSame('weekly', $series->recurrence_type);
        $this->assertSame('write', $series->default_content_payload['stages'][0]['id']);
        $this->assertSame(1, $series->next_sequence_number);
    }

    public function test_weekly_monthly_manual_and_project_period_previews_are_deterministic(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        foreach ([
            'weekly' => '2026-W41', 'monthly' => '2026-10', 'manual' => 'manual-1', 'project_based' => 'project-'.$project->id.'-1',
        ] as $type => $key) {
            $series = $this->createSeries($actor, $type === 'project_based' ? $project : null, ['name' => $type, 'recurrenceType' => $type]);
            $preview = app(SeriesOccurrenceService::class)->preview($series->load('project'));
            $this->assertSame($key, $preview['periodKey']);
            $this->assertSame($preview, app(SeriesOccurrenceService::class)->preview($series->fresh()->load('project')));
        }
    }

    public function test_create_next_uses_central_code_workflow_and_project_inheritance(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        $department = \App\Models\Department::create(['name' => 'Editorial', 'manager_id' => $actor->id, 'status' => 'active']);
        $series = $this->createSeries($actor, $project, ['departmentId' => $department->id]);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $response = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $preview['periodKey']])->assertCreated();
        $content = Content::findOrFail($response->json('data.id'));
        $this->assertSame($project->id, $content->project_id);
        $this->assertSame($department->id, $content->payload['departmentId']);
        $this->assertSame((string) $department->id, $preview['departmentId']);
        $this->assertSame($series->id, $content->series_id);
        $this->assertSame(1, $content->series_sequence);
        $this->assertSame($preview['periodKey'], $content->period_key);
        $this->assertStringStartsWith('WE', $content->code);
        $this->assertSame('write-occ-1', $content->payload['stages'][0]['id']);
        $this->assertDatabaseHas('tasks', ['content_id' => $content->id, 'kind' => 'content_work']);
        $nextPreview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $nextId = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $nextPreview['periodKey']])
            ->assertCreated()->json('data.id');
        $next = Content::findOrFail($nextId);
        $this->assertSame(2, $next->series_sequence);
        $this->assertNotSame($content->code, $next->code);
        $this->assertNotSame($content->period_key, $next->period_key);
    }

    public function test_next_confirmation_is_retry_safe_and_period_unique(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor);
        $key = app(SeriesOccurrenceService::class)->preview($series)['periodKey'];
        $first = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $key])->assertCreated();
        $second = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $key])->assertOk();
        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, Content::where('series_id', $series->id)->where('period_key', $key)->count());
    }

    public function test_stale_confirmation_is_rejected_after_another_occurrence_wins(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor);
        $first = app(SeriesOccurrenceService::class)->preview($series);
        $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $first['periodKey']])->assertCreated();
        $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => 'stale-period'])->assertUnprocessable();
        $this->assertDatabaseCount('contents', 1);
    }

    public function test_occurrences_remain_independent_when_one_is_delayed(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor);
        $first = app(SeriesOccurrenceService::class)->createNext($actor, $series, app(SeriesOccurrenceService::class)->preview($series)['periodKey']);
        $secondPreview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $second = app(SeriesOccurrenceService::class)->createNext($actor, $series->fresh(), $secondPreview['periodKey']);
        $first->update(['status' => 'suspended']);
        $second->update(['status' => 'published']);
        $this->assertSame('suspended', $first->fresh()->status);
        $this->assertSame('published', $second->fresh()->status);
        $this->assertNotSame($first->tasks()->first()?->id, $second->tasks()->first()?->id);
    }

    public function test_archive_series_preserves_all_occurrences_and_history(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $content = app(SeriesOccurrenceService::class)->createNext($actor, $series, $preview['periodKey']);
        $this->deleteJson("/api/v1/content-series/{$series->id}")->assertOk()->assertJsonPath('data.status', 'archived');
        $this->assertNotNull($content->fresh());
        $this->assertDatabaseHas('activity_logs', ['type' => 'series_archived']);
    }

    public function test_batch_is_idempotent_has_distinct_periods_and_defers_future_tasks(): void
    {
        $actor = $this->actor();
        $series = $this->createSeries($actor, null, ['recurrenceConfig' => ['startDate' => '2030-01-07', 'interval' => 1, 'deadlineOffsetDays' => 2]]);
        $key = 'd405583d-2bd7-4240-8c62-142ba05d38d4';
        $first = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/batch", ['requestKey' => $key, 'count' => 3])->assertCreated();
        $second = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/batch", ['requestKey' => $key, 'count' => 3])->assertCreated();
        $this->assertSame(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id'));
        $this->assertSame(3, Content::where('series_id', $series->id)->distinct()->count('period_key'));
        $this->assertSame(0, Task::whereIn('content_id', Content::where('series_id', $series->id)->select('id'))->count());
        $this->deleteJson("/api/v1/content-series/{$series->id}")->assertOk();
        $this->assertSame(3, Content::where('series_id', $series->id)->count());
    }

    public function test_due_activation_is_idempotent_and_materializes_snapshot_tasks_once(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor, null, ['recurrenceConfig' => ['startDate' => '2026-10-01', 'interval' => 1]]);
        $content = app(SeriesOccurrenceService::class)->createBatch($actor, $series, '159ff755-b5fb-4424-803a-a9d077b37548', 1)->first();
        // Force a planned marker to exercise the optional activator independently of wall clock.
        $payload = $content->payload; $payload['_seriesPlanning'] = ['activateAt' => '2026-10-01', 'activatedAt' => null];
        $content->update(['payload' => $payload]); $content->tasks()->delete();
        $this->assertSame(1, app(PlannedOccurrenceActivator::class)->activateDue(now()));
        $count = $content->tasks()->count();
        $this->assertGreaterThan(0, $count);
        $this->assertSame(0, app(PlannedOccurrenceActivator::class)->activateDue(now()));
        $this->assertSame($count, $content->tasks()->count());
    }

    public function test_idea_and_meeting_project_links_are_optional_filterable_and_acl_scoped(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        $idea = $this->postJson('/api/v1/ideas', ['title' => 'Linked idea', 'creatorId' => $actor->id, 'projectId' => $project->id])->assertCreated();
        $meeting = $this->postJson('/api/v1/think-tank-meetings', ['title' => 'Linked meeting', 'organizerId' => $actor->id,
            'status' => 'scheduled', 'projectId' => $project->id])->assertCreated();
        $optional = $this->postJson('/api/v1/ideas', ['title' => 'Standalone', 'creatorId' => $actor->id])->assertCreated();
        $this->assertSame((string) $project->id, $idea->json('data.projectId'));
        $this->assertSame((string) $project->id, $meeting->json('data.projectId'));
        $this->assertNull($optional->json('data.projectId'));
        $this->getJson('/api/v1/ideas?project_id='.$project->id)->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseHas('activity_logs', ['project_id' => $project->id, 'type' => 'project_idea_linked']);
        $this->assertDatabaseHas('activity_logs', ['project_id' => $project->id, 'type' => 'project_meeting_linked']);
    }

    public function test_action_only_idea_permission_cannot_relink_a_project(): void
    {
        $admin = $this->actor(); $project = $this->project($admin);
        $idea = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'No relink', 'owner_id' => $admin->id,
            'status' => 'submitted', 'payload' => ['title' => 'No relink', 'status' => 'submitted']]);
        $actor = $this->actor(['thinktank.view', 'thinktank.approve_convert', 'projects.view'], 'idea_action');
        $project->members()->syncWithoutDetaching([$actor->id]);
        $this->putJson('/api/v1/ideas/'.$idea->id, ['projectId' => $project->id])->assertForbidden();
        $this->assertNull($idea->fresh()->project_id);
    }

    public function test_project_archive_preserves_contents_series_assets_ideas_meetings_and_tasks(): void
    {
        $actor = $this->actor(); $project = $this->project($actor); $series = $this->createSeries($actor, $project);
        $content = Content::create(['title' => 'Keep', 'type' => 'article', 'status' => 'planning', 'project_id' => $project->id, 'payload' => []]);
        $task = Task::create(['title' => 'Keep task', 'project_id' => $project->id, 'status' => 'backlog', 'priority' => 'medium']);
        $record = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'Keep idea', 'owner_id' => $actor->id, 'project_id' => $project->id, 'payload' => []]);
        $meeting = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_MEETING, 'title' => 'Keep meeting', 'owner_id' => $actor->id, 'project_id' => $project->id, 'payload' => []]);
        $asset = DamAsset::create(['type' => 'content', 'title' => 'Keep asset', 'status' => 'draft', 'confidentiality' => 'internal', 'owner_id' => $actor->id, 'created_by' => $actor->id]);
        DamRelation::create(['asset_id' => $asset->id, 'related_type' => 'project', 'related_id' => $project->id, 'relation_type' => 'attachment', 'created_by' => $actor->id]);
        $this->deleteJson('/api/v1/projects/'.$project->id)->assertNoContent();
        $this->assertSame('archived', $project->fresh()->status);
        foreach ([$series, $content, $task, $record, $meeting, $asset] as $model) $this->assertNotNull($model->fresh());
    }

    public function test_content_plan_counts_are_derived_from_real_content(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        Content::create(['title' => 'A', 'type' => 'article', 'status' => 'planning', 'project_id' => $project->id, 'payload' => []]);
        Content::create(['title' => 'B', 'type' => 'article', 'status' => 'published', 'project_id' => $project->id, 'payload' => []]);
        $created = $this->postJson("/api/v1/projects/{$project->id}/content-plan", ['contentType' => 'article', 'plannedCount' => 5,
            'createdCount' => 999, 'publishedCount' => 999])->assertCreated()
            ->assertJsonPath('data.createdCount', 2)->assertJsonPath('data.publishedCount', 1);
        $planId = $created->json('data.id');
        $this->patchJson("/api/v1/projects/{$project->id}/content-plan/{$planId}", ['plannedCount' => 6,
            'createdCount' => 0, 'publishedCount' => 0])->assertOk()->assertJsonPath('data.plannedCount', 6)
            ->assertJsonPath('data.createdCount', 2)->assertJsonPath('data.publishedCount', 1);
        $this->deleteJson("/api/v1/projects/{$project->id}/content-plan/{$planId}")->assertNoContent();
        $this->assertSame(2, Content::where('project_id', $project->id)->count());
    }

    public function test_project_progress_prefers_tasks_then_falls_back_to_contents(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        Content::create(['title' => 'Published', 'type' => 'article', 'status' => 'published', 'project_id' => $project->id, 'payload' => []]);
        $this->assertSame(100, app(ProjectProgress::class)->calculate($project));
        Task::create(['title' => 'Done', 'project_id' => $project->id, 'status' => 'completed', 'priority' => 'medium']);
        Task::create(['title' => 'Open', 'project_id' => $project->id, 'status' => 'backlog', 'priority' => 'medium']);
        $this->assertSame(50, app(ProjectProgress::class)->calculate($project));
    }

    public function test_project_and_series_actions_reject_outsiders_server_side(): void
    {
        $admin = $this->actor(); $project = $this->project($admin); $series = $this->createSeries($admin, $project);
        $outsider = $this->actor(['projects.view', 'projects.edit', 'content.view', 'content.edit'], 'outsider');
        $this->getJson('/api/v1/projects/'.$project->id)->assertForbidden();
        $this->patchJson('/api/v1/content-series/'.$series->id, ['name' => 'No'])->assertForbidden();
        $this->assertSame('Weekly editorial', $series->fresh()->name);
    }

    public function test_selected_scoped_correction_assignee_gets_new_contextual_task_without_reopening_work(): void
    {
        $reviewer = $this->actor(); $project = $this->project($reviewer);
        $assignee = $this->actor(['content.view'], 'worker'); $project->members()->syncWithoutDetaching([$assignee->id]);
        Sanctum::actingAs($reviewer);
        $content = Content::create(['title' => 'Review me', 'type' => 'article', 'status' => 'reviewing', 'project_id' => $project->id,
            'owner_id' => $reviewer->id, 'payload' => ['stages' => [$this->stage('review', ['status' => 'pending_approval',
                'reviewRequired' => true, 'reviewerId' => (string) $reviewer->id, 'assigneeId' => (string) $assignee->id,
                'outputs' => [['id' => 'out', 'name' => 'Draft', 'isDelivered' => true]]])]]]);
        app(ContentStageTaskSync::class)->sync($content);
        $work = Task::where('content_id', $content->id)->where('kind', 'content_work')->firstOrFail();
        $work->update(['status' => 'completed']);
        $invalid = $this->actor(['content.view'], 'outside_worker');
        Sanctum::actingAs($reviewer);
        $version = ContentReview::version($content->fresh());
        $this->postJson("/api/v1/contents/{$content->id}/stages/review/decision", ['decision' => 'reject', 'note' => 'Fix it',
            'correctionAssigneeId' => $invalid->id, 'expectedVersion' => $version])->assertUnprocessable();
        $this->assertDatabaseMissing('tasks', ['content_id' => $content->id, 'kind' => 'content_correction']);
        $this->postJson("/api/v1/contents/{$content->id}/stages/review/decision", ['decision' => 'reject', 'note' => 'Fix it',
            'correctionAssigneeId' => $assignee->id, 'expectedVersion' => $version])->assertOk();
        $correction = Task::where('content_id', $content->id)->where('kind', 'content_correction')->firstOrFail();
        $this->assertSame($assignee->id, $correction->assignee_id);
        $this->assertSame((string) $reviewer->id, $correction->context['reviewerId']);
        $this->assertSame('completed', $work->fresh()->status);
    }

    public function test_stage_checklist_is_an_immutable_task_snapshot_separate_from_outputs(): void
    {
        $actor = $this->actor(); $content = Content::create(['title' => 'Checklist', 'type' => 'article', 'status' => 'planning',
            'payload' => ['stages' => [$this->stage('one', ['assigneeId' => (string) $actor->id,
                'outputs' => [['id' => 'deliverable', 'name' => 'Expected output']]])]]]);
        app(ContentStageTaskSync::class)->sync($content);
        $task = Task::where('content_id', $content->id)->where('kind', 'content_work')->firstOrFail();
        $this->assertCount(2, $task->subtasks); $this->assertSame('Check facts', $task->subtasks[0]['title']);
        $edited = $task->subtasks; $edited[0]['completed'] = true; $task->update(['subtasks' => $edited]);
        $payload = $content->payload; $payload['stages'][0]['checklist'] = [['text' => 'Template changed']]; $content->update(['payload' => $payload]);
        app(ContentStageTaskSync::class)->sync($content->fresh());
        $this->assertTrue($task->fresh()->subtasks[0]['completed']);
        $this->assertSame('Check facts', $task->fresh()->subtasks[0]['title']);
    }

    public function test_watch_never_grants_visibility_and_meaningful_notifications_are_deduplicated(): void
    {
        $owner = $this->actor();
        $watcher = $this->actor(['content.view', 'content.watch', 'projects.view'], 'watcher');
        $project = $this->project($watcher);
        $content = Content::create(['title' => 'Followed', 'type' => 'article', 'status' => 'planning', 'owner_id' => $owner->id,
            'project_id' => $project->id, 'payload' => []]);
        $this->postJson('/api/v1/contents/'.$content->id.'/watch')->assertCreated();
        Sanctum::actingAs($owner);
        app(ContentWatchNotifier::class)->meaningful($content, $owner, 'event-1', 'Changed');
        app(ContentWatchNotifier::class)->meaningful($content, $owner, 'event-1', 'Changed');
        $this->assertSame(1, DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->where('user_id', $watcher->id)->count());
        $viewer = $this->actor(['content.view'], 'viewer_only');
        $this->postJson('/api/v1/contents/'.$content->id.'/watch')->assertForbidden();
        $outsider = $this->actor(['content.watch'], 'watch_only');
        $this->postJson('/api/v1/contents/'.$content->id.'/watch')->assertForbidden();
        $this->assertDatabaseMissing('content_watchers', ['content_id' => $content->id, 'user_id' => $outsider->id]);
    }

    public function test_integrity_diagnostics_avoid_healthy_false_positives_and_find_real_mismatch(): void
    {
        $actor = $this->actor(); $project = $this->project($actor); $other = $this->project($actor);
        $series = $this->createSeries($actor, $project, ['processTemplateId' => 'template-healthy',
            'defaultContentPayload' => ['tags' => [], 'assetIds' => [],
                'stages' => [$this->stage('write', ['assigneeId' => (string) $actor->id, 'reviewRequired' => false])]]]);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $content = app(SeriesOccurrenceService::class)->createNext($actor, $series, $preview['periodKey']);
        $healthy = collect(app(IntegrityDiagnostics::class)->findings());
        $this->assertCount(0, $healthy);
        $content->update(['project_id' => $other->id]);
        $findings = collect(app(IntegrityDiagnostics::class)->findings());
        $this->assertTrue($findings->contains(fn ($finding) => $finding['code'] === 'series_project_mismatch' && $finding['id'] === (string) $content->id));
        $this->getJson('/api/v1/integrity')->assertOk()->assertJsonPath('meta.readOnly', true);
    }

    public function test_project_asset_summary_uses_real_multi_relation_dam_links(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        $asset = DamAsset::create(['type' => 'content', 'title' => 'Related', 'status' => 'draft', 'confidentiality' => 'internal', 'owner_id' => $actor->id, 'created_by' => $actor->id]);
        app(\App\Services\DamService::class)->relate($asset, 'project', $project->id, $actor, ['relation_type' => 'attachment']);
        app(\App\Services\DamService::class)->relate($asset, 'project', $project->id, $actor, ['relation_type' => 'attachment']);
        DamRelation::create(['asset_id' => $asset->id, 'related_type' => 'department', 'related_id' => 999, 'relation_type' => 'reference', 'created_by' => $actor->id]);
        $this->assertDatabaseCount('dam_relations', 2);
        $this->assertDatabaseCount('activity_logs', 1);
        $this->assertDatabaseHas('activity_logs', ['project_id' => $project->id, 'type' => 'project_asset_added']);
        $this->getJson("/api/v1/projects/{$project->id}/operations/summary")->assertOk()->assertJsonPath('data.assets', 1);
    }

    public function test_important_activity_diffs_are_server_generated_and_exclude_description_values(): void
    {
        $actor = $this->actor(); $project = $this->project($actor);
        $this->patchJson('/api/v1/projects/'.$project->id, ['status' => 'on_hold', 'description' => 'private narrative'])->assertOk();
        $log = \App\Models\ActivityLog::where('type', 'project_updated')->latest()->firstOrFail();
        $this->assertSame('status', $log->metadata['changes'][0]['field']);
        $this->assertStringNotContainsString('private narrative', json_encode($log->metadata));
    }

    public function test_paused_series_cannot_create_next_but_existing_occurrences_remain_available(): void
    {
        $actor = $this->actor(); $series = $this->createSeries($actor);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $content = app(SeriesOccurrenceService::class)->createNext($actor, $series, $preview['periodKey']);
        $series->update(['status' => 'paused']);
        $next = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", ['periodKey' => $next['periodKey']])->assertConflict();
        $this->getJson("/api/v1/content-series/{$series->id}/occurrences")->assertOk()->assertJsonPath('data.0.id', (string) $content->id);
    }
}
