<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamRelation;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentPublication;
use App\Services\ContentReview;
use App\Services\ContentStageTaskSync;
use App\Support\Content\StageAdvanceMode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Behavioural contract for the explicit stage advance policy, the forward
 * command, review/correction integrity, archiving and the stable content code.
 */
class ContentWorkflowPolicyTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions, ?Role $role = null): User
    {
        $role ??= Role::create(['key' => 'policy_'.bin2hex(random_bytes(4)), 'name' => 'Policy', 'is_active' => true]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    /** @return array<string, mixed> */
    private function stage(string $id, array $overrides = []): array
    {
        return [...[
            'id' => $id,
            'stageKey' => $id,
            'title' => 'Stage '.$id,
            'status' => 'not_started',
            'order' => 1,
            'assigneeId' => null,
            'reviewerId' => null,
            'reviewRequired' => true,
            'advanceMode' => StageAdvanceMode::APPROVAL,
            'inputs' => [],
            'outputs' => [],
            'activityLog' => [],
        ], ...$overrides];
    }

    private function content(array $stages, array $overrides = []): Content
    {
        return Content::create([
            'title' => 'Policy content',
            'type' => 'article',
            'status' => 'planning',
            'payload' => ['stages' => $stages, 'history' => [], ...$overrides],
        ]);
    }

    private function version(Content $content): string
    {
        return ContentReview::version($content->fresh());
    }

    public function test_approval_advance_mode_activates_the_next_stage(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'pending_approval', 'order' => 1, 'reviewerId' => (string) $reviewer->id, 'assigneeId' => (string) $reviewer->id]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/decision', [
            'decision' => 'approve', 'expectedVersion' => $this->version($content),
        ])->assertOk()->assertJsonPath('data.stages.0.status', 'approved');

        $fresh = $content->fresh();
        $this->assertSame('approved', $fresh->payload['stages'][0]['status']);
        $this->assertSame('not_started', $fresh->payload['stages'][1]['status']);
        // The next stage's canonical work task exists and is not in a working state.
        $work = Task::where('content_id', $content->id)->where('content_stage_id', 'two')
            ->where('kind', 'content_work')->firstOrFail();
        $this->assertFalse(in_array($work->status, ['in_progress', 'review'], true));
    }

    public function test_approval_does_not_activate_the_next_stage_when_advance_mode_is_forwarded_output(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'pending_approval', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/decision', [
            'decision' => 'approve', 'expectedVersion' => $this->version($content),
        ])->assertOk()->assertJsonPath('data.stages.0.status', 'approved');

        $fresh = $content->fresh();
        $this->assertSame('approved', $fresh->payload['stages'][0]['status']);
        // Approval alone must not unlock the next stage.
        $this->assertSame('pending_dependency', $fresh->payload['stages'][1]['status']);
        $work = Task::where('content_id', $content->id)->where('content_stage_id', 'two')
            ->where('kind', 'content_work')->firstOrFail();
        $this->assertFalse(in_array($work->status, ['in_progress', 'review'], true));
        // The stage status, not the derived content status, is the real gate here.
        $this->assertSame('planning', $fresh->status);
    }

    public function test_forward_activates_the_next_stage_and_links_the_output_exactly_once(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design V1', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true, 'assetId' => '7']]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $reviewer->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $url = '/api/v1/contents/'.$content->id.'/stages/one/outputs/design/forward';
        $version = $this->version($content);

        $this->postJson($url, ['expectedVersion' => $version])->assertOk()
            ->assertJsonPath('data.stages.1.status', 'not_started')
            ->assertJsonPath('data.stages.1.inputs.0.sourceStageId', 'one')
            ->assertJsonPath('data.stages.1.inputs.0.sourceOutputId', 'design')
            ->assertJsonPath('data.stages.1.inputs.0.isReady', true)
            ->assertJsonPath('data.stages.1.inputs.0.forwardedBy', (string) $reviewer->id)
            ->assertJsonPath('data.stages.1.inputs.0.contentRef', '7');

        $inputs = $content->fresh()->payload['stages'][1]['inputs'];
        $this->assertCount(1, $inputs);
        $this->assertNotNull($inputs[0]['forwardedAt']);

        $work = Task::where('content_id', $content->id)->where('content_stage_id', 'two')
            ->where('kind', 'content_work')->firstOrFail();
        $this->assertFalse(in_array($work->status, ['completed', 'archived'], true));
    }

    public function test_forward_retry_is_idempotent_and_never_duplicates_the_input(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design V1', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true, 'assetId' => '7']]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $reviewer->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $url = '/api/v1/contents/'.$content->id.'/stages/one/outputs/design/forward';
        $version = $this->version($content);

        $this->postJson($url, ['expectedVersion' => $version])->assertOk();
        // A lost HTTP response is retried with the same (now stale) version: still a no-op.
        $this->postJson($url, ['expectedVersion' => $version])->assertOk();
        $this->postJson($url, ['expectedVersion' => $this->version($content)])->assertOk();

        $stages = $content->fresh()->payload['stages'];
        $this->assertCount(1, $stages[1]['inputs']);
        $this->assertSame('one', $stages[1]['inputs'][0]['sourceStageId']);
        $this->assertSame('design', $stages[1]['inputs'][0]['sourceOutputId']);
        $this->assertSame('not_started', $stages[1]['status']);
    }

    public function test_a_non_reviewer_cannot_forward_an_output(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $role = $reviewer->role;
        $outsider = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true]]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $reviewer->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        Sanctum::actingAs($outsider);
        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/outputs/design/forward', [
            'expectedVersion' => $this->version($content),
        ])->assertForbidden();

        $this->assertSame('pending_dependency', $content->fresh()->payload['stages'][1]['status']);
    }

    public function test_a_reviewer_without_permission_cannot_forward_an_output(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        // Same person is named as the reviewer, but the account has no content.approve grant.
        $plain = $this->actor(['content.view', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $plain->id,
                'assigneeId' => (string) $manager->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true]]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $manager->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        Sanctum::actingAs($plain);
        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/outputs/design/forward', [
            'expectedVersion' => $this->version($content),
        ])->assertForbidden();
        $this->assertSame('pending_dependency', $content->fresh()->payload['stages'][1]['status']);
    }

    public function test_stale_expected_version_is_rejected_with_conflict(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true]]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $reviewer->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/outputs/design/forward', [
            'expectedVersion' => str_repeat('a', 64),
        ])->assertConflict();
        $this->assertSame('pending_dependency', $content->fresh()->payload['stages'][1]['status']);
    }

    public function test_rejection_creates_one_correction_task_and_retry_does_not_duplicate_it(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $assignee = User::factory()->create(['status' => 'active', 'role_id' => $reviewer->role_id, 'role_key' => $reviewer->role_key]);
        $content = $this->content([
            $this->stage('one', ['status' => 'pending_approval', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $assignee->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $url = '/api/v1/contents/'.$content->id.'/stages/one/decision';
        $version = $this->version($content);

        $this->postJson($url, ['decision' => 'reject', 'note' => 'Fix the sources', 'expectedVersion' => $version])->assertOk();
        $this->assertSame('revisions_needed', $content->fresh()->payload['stages'][0]['status']);
        $this->assertSame('Fix the sources', $content->fresh()->payload['stages'][0]['rejectionReason']);
        $this->assertSame(1, Task::where('kind', 'content_correction')->count());
        $correction = Task::where('kind', 'content_correction')->firstOrFail();
        $this->assertSame((string) $assignee->id, (string) $correction->assignee_id);
        $this->assertSame($content->id, $correction->content_id);
        $this->assertNotNull($correction->parent_task_id);
        $this->assertNotNull($correction->source_event_id);
        $this->assertNotEmpty($content->fresh()->payload['history']);

        // A retry of the same rejection is refused, and never opens a second task.
        $this->postJson($url, ['decision' => 'reject', 'note' => 'Again', 'expectedVersion' => $version])->assertConflict();
        $this->assertSame(1, Task::where('kind', 'content_correction')->count());
    }

    public function test_rejection_never_reopens_the_previous_work_task(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $assignee = User::factory()->create(['status' => 'active', 'role_id' => $reviewer->role_id, 'role_key' => $reviewer->role_key]);
        $content = $this->content([
            $this->stage('one', ['status' => 'pending_approval', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $assignee->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $work = Task::where('content_id', $content->id)->where('content_stage_id', 'one')->where('kind', 'content_work')->firstOrFail();
        $work->update(['status' => 'completed']);

        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/decision', [
            'decision' => 'reject', 'note' => 'Needs work', 'expectedVersion' => $this->version($content),
        ])->assertOk();

        $this->assertSame('completed', $work->fresh()->status);
        $this->assertSame('completed', Task::where('content_id', $content->id)->where('content_stage_id', 'one')
            ->where('kind', 'content_review')->value('status'));
    }

    public function test_output_versions_and_history_survive_a_correction_cycle(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $asset = DamAsset::create(['type' => 'file', 'title' => 'Design V1', 'status' => 'approved',
            'owner_id' => $reviewer->id, 'created_by' => $reviewer->id]);
        $content = $this->content([
            $this->stage('one', ['status' => 'pending_approval', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'outputs' => [
                    ['id' => 'design', 'name' => 'Design V1', 'type' => 'design_file', 'isRequired' => true,
                        'isDelivered' => true, 'assetId' => (string) $asset->id, 'deliveredAt' => '2026-10-01T00:00:00+00:00'],
                ]]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $stageBefore = $content->fresh()->payload['stages'][0];

        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/decision', [
            'decision' => 'reject', 'note' => 'Wrong palette', 'expectedVersion' => $this->version($content),
        ])->assertOk();

        $stageAfter = $content->fresh()->payload['stages'][0];
        // The delivered output of the rejected cycle is preserved verbatim.
        $this->assertSame($stageBefore['outputs'][0], $stageAfter['outputs'][0]);
        $this->assertSame((string) $asset->id, $stageAfter['outputs'][0]['assetId']);
        $this->assertDatabaseHas('dam_assets', ['id' => $asset->id, 'title' => 'Design V1']);
        $this->assertGreaterThan(count($stageBefore['activityLog'] ?? []), count($stageAfter['activityLog']));

        // A new output for the new cycle is appended, not overwritten.
        $stage = $content->fresh()->payload['stages'][0];
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[...$stage, 'status' => 'in_progress']]])->assertOk();
        $stage = $content->fresh()->payload['stages'][0];
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => [[
            ...$stage,
            'outputs' => [...$stage['outputs'], ['id' => 'design-v2', 'name' => 'Design V2', 'type' => 'design_file',
                'isRequired' => true, 'isDelivered' => true, 'assetId' => (string) $asset->id]],
        ]]])->assertOk();

        $outputs = $content->fresh()->payload['stages'][0]['outputs'];
        $this->assertCount(2, $outputs);
        $this->assertSame('Design V1', $outputs[0]['name']);
        $this->assertSame('Design V2', $outputs[1]['name']);
    }

    public function test_publish_is_rejected_before_the_workflow_is_ready(): void
    {
        $publisher = $this->actor(['content.view', 'content.edit', 'content.publish', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'in_progress', 'order' => 1, 'assigneeId' => (string) $publisher->id]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $publisher->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->postJson('/api/v1/contents/'.$content->id.'/publish', [
            'expectedVersion' => ContentPublication::version($content),
        ])->assertConflict();
        $this->assertSame('producing', $content->fresh()->status);
        $this->assertSame(0, Task::where('kind', 'content_publish')->count());
    }

    public function test_generic_patch_cannot_forge_review_forward_or_publication_metadata(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'reviewerId' => (string) $reviewer->id,
                'assigneeId' => (string) $reviewer->id, 'advanceMode' => StageAdvanceMode::FORWARDED_OUTPUT,
                'outputs' => [['id' => 'design', 'name' => 'Design', 'type' => 'design_file', 'isRequired' => true, 'isDelivered' => true]]]),
            $this->stage('two', ['status' => 'pending_dependency', 'order' => 2, 'assigneeId' => (string) $reviewer->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $forged = $content->fresh()->payload['stages'];
        $forged[0]['outputs'][0]['forwardedToStageId'] = 'two';
        $forged[0]['outputs'][0]['forwardedBy'] = '999';
        $forged[0]['outputs'][0]['forwardedAt'] = '2000-01-01T00:00:00+00:00';
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => $forged,
            'reviewVersion' => $this->version($content)])->assertUnprocessable();
        $this->assertArrayNotHasKey('forwardedToStageId', $content->fresh()->payload['stages'][0]['outputs'][0]);

        $forged = $content->fresh()->payload['stages'];
        $forged[0]['approvedBy'] = '999';
        $forged[0]['approvedAt'] = '2000-01-01T00:00:00+00:00';
        $this->patchJson('/api/v1/contents/'.$content->id, ['stages' => $forged,
            'reviewVersion' => $this->version($content)])->assertUnprocessable();

        $this->patchJson('/api/v1/contents/'.$content->id, ['_publication' => ['processed' => true]])->assertUnprocessable();
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'published'])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'ready_to_publish'])->assertConflict();
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'reviewing'])->assertConflict();
        // Echoing back the status the server already reported stays allowed.
        $this->patchJson('/api/v1/contents/'.$content->id, ['status' => 'planning'])->assertOk();
    }

    public function test_delete_archives_content_and_keeps_history_tasks_and_dam_relations(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.delete', 'tasks.view']);
        $asset = DamAsset::create(['type' => 'content', 'title' => 'Script', 'status' => 'approved',
            'owner_id' => $manager->id, 'created_by' => $manager->id]);
        $content = $this->content([
            $this->stage('one', ['status' => 'in_progress', 'order' => 1, 'assigneeId' => (string) $manager->id]),
        ], ['history' => [['id' => 'seed', 'action' => 'created']]]);
        app(ContentStageTaskSync::class)->sync($content);
        DB::table('dam_relations')->insert([
            'asset_id' => $asset->id,
            'related_type' => 'content',
            'related_id' => $content->id,
            'relation_type' => 'attachment',
            'created_by' => $manager->id,
            'created_at' => now(),
        ]);
        $relation = DB::table('dam_relations')->where('related_id', $content->id)->value('id');
        $task = Task::where('content_id', $content->id)->where('kind', 'content_work')->firstOrFail();
        $task->update(['status' => 'completed']);

        $this->deleteJson('/api/v1/contents/'.$content->id)->assertNoContent();

        $fresh = $content->fresh();
        $this->assertNotNull($fresh, 'Archiving must never remove the content row.');
        $this->assertSame('archived', $fresh->status);
        $this->assertSame('producing', $fresh->previous_status);
        $this->assertGreaterThan(1, count($fresh->payload['history']));
        $this->assertDatabaseHas('dam_relations', ['id' => $relation]);
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'status' => 'completed']);
        // A repeated delete is a no-op, not a second destructive action.
        $this->deleteJson('/api/v1/contents/'.$content->id)->assertNoContent();
        $this->assertSame('archived', $content->fresh()->status);
    }

    public function test_restore_returns_the_previous_valid_status(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.delete', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'approved', 'order' => 1, 'assigneeId' => (string) $manager->id]),
            $this->stage('two', ['status' => 'completed', 'order' => 2, 'assigneeId' => (string) $manager->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);
        $this->assertSame('ready_to_publish', $content->fresh()->status);

        $this->deleteJson('/api/v1/contents/'.$content->id)->assertNoContent();
        $this->postJson('/api/v1/contents/'.$content->id.'/restore')->assertOk()
            ->assertJsonPath('data.status', 'ready_to_publish');
        $this->assertNull($content->fresh()->previous_status);
    }

    public function test_force_delete_requires_the_dedicated_permission_and_is_refused_with_dependencies(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.delete', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', ['status' => 'in_progress', 'order' => 1, 'assigneeId' => (string) $manager->id]),
        ]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->deleteJson('/api/v1/contents/'.$content->id.'/force')->assertForbidden();
        $this->assertNotNull($content->fresh());

        // Even with the permission, an open workflow task blocks a hard delete.
        $this->actor(['content.view', 'content.delete', 'content.force_delete', 'tasks.view']);
        $this->deleteJson('/api/v1/contents/'.$content->id.'/force')->assertConflict();
        $this->assertNotNull($content->fresh());

        Task::where('content_id', $content->id)->update(['status' => 'archived']);
        $this->deleteJson('/api/v1/contents/'.$content->id.'/force')->assertNoContent();
        $this->assertNull($content->fresh());
        $this->assertDatabaseHas('activity_logs', ['type' => 'content_force_deleted']);
    }

    public function test_content_code_is_allocated_unique_and_returned_in_the_resource(): void
    {
        $this->actor(['content.view', 'content.create', 'content.edit', 'tasks.view']);
        $first = $this->postJson('/api/v1/contents', ['title' => 'First', 'type' => 'article'])->assertCreated();
        $code = $first->json('data.code');
        $this->assertIsString($code);
        $this->assertNotSame('', $code);
        $this->assertMatchesRegularExpression('/^[A-Z0-9][A-Z0-9._-]*$/', $code);
        $this->assertSame($code, Content::firstOrFail()->code);

        $second = $this->postJson('/api/v1/contents', ['title' => 'Second', 'type' => 'article'])->assertCreated();
        $this->assertNotSame($code, $second->json('data.code'));

        // An explicit, still-free code is honoured.
        $this->postJson('/api/v1/contents', ['title' => 'Third', 'type' => 'article', 'code' => 'SA03'])
            ->assertCreated()->assertJsonPath('data.code', 'SA03');
        $this->postJson('/api/v1/contents', ['title' => 'Fourth', 'type' => 'article', 'code' => 'SA03'])
            ->assertCreated();
        $this->assertNotSame('SA03', Content::where('title', 'Fourth')->value('code'));
        $this->assertSame(4, Content::query()->whereNotNull('code')->count());

        // An ordinary editor cannot re-issue an existing code.
        $this->actor(['content.view', 'content.edit', 'tasks.view']);
        $this->patchJson('/api/v1/contents/'.Content::where('code', 'SA03')->value('id'), ['code' => 'ZZ99'])
            ->assertForbidden();
    }

    public function test_global_search_finds_content_by_code_title_and_topic(): void
    {
        $this->actor(['content.view', 'content.create', 'content.edit', 'tasks.view']);
        $this->postJson('/api/v1/contents', ['title' => 'Visual report', 'type' => 'article',
            'code' => 'KM141', 'topic' => 'Knowledge management'])->assertCreated();
        $this->postJson('/api/v1/contents', ['title' => 'Radio piece', 'type' => 'podcast',
            'code' => 'RV130', 'topic' => 'Culture'])->assertCreated();
        $this->postJson('/api/v1/contents', ['title' => 'Archive note', 'type' => 'article',
            'code' => 'SA03', 'topic' => 'Series'])->assertCreated();

        $this->getJson('/api/v1/search?query=KM141')->assertOk()
            ->assertJsonCount(1, 'data.contents')->assertJsonPath('data.contents.0.code', 'KM141');
        $this->getJson('/api/v1/search?query=Radio')->assertOk()
            ->assertJsonPath('data.contents.0.code', 'RV130');
        $this->getJson('/api/v1/search?query=Series')->assertOk()
            ->assertJsonPath('data.contents.0.code', 'SA03');
        $this->getJson('/api/v1/search?query=KM')->assertOk()->assertJsonCount(1, 'data.contents');
    }

    public function test_archived_content_keeps_its_code_and_is_still_findable(): void
    {
        $this->actor(['content.view', 'content.create', 'content.edit', 'content.delete', 'tasks.view']);
        $created = $this->postJson('/api/v1/contents', ['title' => 'Archived', 'type' => 'article', 'code' => 'SA03'])
            ->assertCreated()->json('data.id');
        $this->deleteJson('/api/v1/contents/'.$created)->assertNoContent();

        $this->getJson('/api/v1/search?query=SA03')->assertOk()->assertJsonCount(1, 'data.contents');
        $this->assertSame('SA03', Content::findOrFail($created)->code);
        // A new content may not take the archived code.
        $this->postJson('/api/v1/contents', ['title' => 'Another', 'type' => 'article', 'code' => 'SA03'])
            ->assertCreated();
        $this->assertNotSame('SA03', Content::where('title', 'Another')->value('code'));
    }

    public function test_legacy_stage_without_advance_mode_keeps_the_previous_approval_behaviour(): void
    {
        $reviewer = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $legacy = $this->stage('one', ['status' => 'pending_approval', 'order' => 1,
            'reviewerId' => (string) $reviewer->id, 'assigneeId' => (string) $reviewer->id]);
        unset($legacy['advanceMode']);
        $content = $this->content([$legacy, $this->stage('two', ['status' => 'pending_dependency', 'order' => 2])]);
        app(ContentStageTaskSync::class)->sync($content);

        $this->assertSame(StageAdvanceMode::APPROVAL, ContentReview::advanceMode($legacy));
        $this->postJson('/api/v1/contents/'.$content->id.'/stages/one/decision', [
            'decision' => 'approve', 'expectedVersion' => $this->version($content),
        ])->assertOk();
        $this->assertSame('not_started', $content->fresh()->payload['stages'][1]['status']);
    }
}
