<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\DamAsset;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\ProjectContentPlan;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\SeriesOccurrenceService;
use App\Support\Calendar\PersianCalendar;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentSeriesLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(): User
    {
        $role = Role::create(['key' => 'admin', 'name' => 'Administrator', 'is_active' => true]);
        foreach ([
            'content.view', 'content.create', 'content.edit', 'content.delete', 'content.workflow.manage',
            'projects.view', 'projects.edit', 'assets.view', 'tasks.view', 'integrity.view',
        ] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $actor = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => 'admin']);
        Sanctum::actingAs($actor);

        return $actor;
    }

    /** @return array<string,mixed> */
    private function payload(User $actor, array $overrides = []): array
    {
        return [...[
            'name' => 'Editorial lifecycle', 'description' => 'Revision contract', 'codePrefix' => 'ED',
            'contentType' => 'article', 'ownerId' => $actor->id, 'recurrenceType' => 'weekly',
            'recurrenceConfig' => [
                'startDate' => '2026-10-05', 'interval' => 1, 'deadlineOffsetDays' => 2,
                'calendar' => 'jalali', 'activationTime' => '08:00',
            ],
            'defaultContentPayload' => [
                'tags' => ['editorial'], 'assetIds' => [],
                'stages' => [[
                    'id' => 'write', 'stageKey' => 'write', 'title' => 'Write', 'order' => 1,
                    'status' => 'not_started', 'assigneeId' => (string) $actor->id,
                    'relativeDueDays' => 1, 'reviewRequired' => false,
                    'inputs' => [], 'outputs' => [], 'checklist' => [['text' => 'Fact check']],
                ]],
            ],
            'defaultPublicationConfig' => ['channels' => [], 'status' => 'planned', 'visibility' => 'internal', 'time' => '14:30'],
        ], ...$overrides];
    }

    private function create(User $actor, array $overrides = []): ContentSeries
    {
        $id = $this->postJson('/api/v1/content-series', $this->payload($actor, $overrides))
            ->assertCreated()->assertJsonPath('data.lockVersion', 1)->json('data.id');

        return ContentSeries::findOrFail($id);
    }

    public function test_configuration_revisions_only_apply_to_future_occurrences_and_lock_stale_updates(): void
    {
        $actor = $this->actor();
        $series = $this->create($actor);
        $firstPreview = app(SeriesOccurrenceService::class)->preview($series);
        $first = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", [
            'periodKey' => $firstPreview['periodKey'], 'requestKey' => '62b84086-9dc3-43e3-a1a8-8e36f92d9d11',
            'lockVersion' => 1,
        ])->assertCreated();
        $firstContent = Content::findOrFail($first->json('data.id'));
        $initialRevision = $firstContent->series_revision_id;

        $update = $this->payload($actor, [
            'lockVersion' => 2, 'changeReason' => 'مهلت آینده طولانی‌تر شد',
            'recurrenceConfig' => [
                'startDate' => '2026-10-05', 'interval' => 1, 'deadlineOffsetDays' => 9,
                'calendar' => 'jalali', 'activationTime' => '08:00',
            ],
        ]);
        $response = $this->patchJson("/api/v1/content-series/{$series->id}", $update)->assertOk()
            ->assertJsonPath('data.currentRevision.version', 2)
            ->assertJsonPath('data.currentRevision.effectiveFromSequence', 2);
        $this->assertSame($initialRevision, $firstContent->fresh()->series_revision_id);
        $this->assertSame(2, $series->revisions()->count());

        $this->patchJson("/api/v1/content-series/{$series->id}", [...$update, 'lockVersion' => 2])
            ->assertConflict();

        $series = $series->fresh();
        $secondPreview = app(SeriesOccurrenceService::class)->preview($series);
        $second = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", [
            'periodKey' => $secondPreview['periodKey'], 'requestKey' => '7d11495f-529f-4e17-98d2-e69ae1af225a',
            'lockVersion' => $response->json('data.lockVersion'),
        ])->assertCreated();
        $secondContent = Content::findOrFail($second->json('data.id'));
        $this->assertNotSame($initialRevision, $secondContent->series_revision_id);
        $this->assertSame($series->current_revision_id, $secondContent->series_revision_id);
        $this->assertSame(9.0, CarbonImmutable::parse($secondPreview['startDate'])
            ->diffInDays(CarbonImmutable::parse($secondContent->deadline)));
    }

    public function test_single_retry_key_wins_before_a_stale_lock_check(): void
    {
        $actor = $this->actor();
        $series = $this->create($actor);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $body = ['periodKey' => $preview['periodKey'], 'requestKey' => 'bd20df3f-4ffd-4f0a-863a-38285da5e063', 'lockVersion' => 1];
        $first = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", $body)->assertCreated();
        $retry = $this->postJson("/api/v1/content-series/{$series->id}/occurrences/next", $body)->assertOk();

        $this->assertSame($first->json('data.id'), $retry->json('data.id'));
        $this->assertSame('weekly-001', $preview['periodKey']);
        $this->assertSame('هفته 1', $preview['periodLabel']);
        $this->assertSame('2026-10-05', $preview['publicationDate']);
        $this->assertSame('14:30', $preview['publicationTime']);
        $this->assertSame('ED001', $first->json('data.code'));
        $this->assertSame('ED001 - Editorial lifecycle - هفته 1', $first->json('data.title'));
        $this->assertSame('2026-10-05', $first->json('data.publishInfo.date'));
        $this->assertSame('14:30', $first->json('data.publishInfo.time'));
        $range = app(SeriesOccurrenceService::class)->previewRange($series->fresh(), 2);
        $this->assertSame(['ED002', 'ED003'], collect($range)->pluck('proposedCode')->all());
        $this->assertSame(1, Content::where('series_id', $series->id)->count());
    }

    public function test_manual_occurrence_requires_explicit_dates(): void
    {
        $actor = $this->actor();
        $series = $this->create($actor, ['name' => 'Manual', 'codePrefix' => 'MAN', 'recurrenceType' => 'manual']);
        $preview = app(SeriesOccurrenceService::class)->preview($series);
        $url = "/api/v1/content-series/{$series->id}/occurrences/next";
        $base = ['periodKey' => $preview['periodKey'], 'requestKey' => 'b2674369-b794-45f2-af4d-c795a229eb8d', 'lockVersion' => 1];
        $this->postJson($url, $base)->assertUnprocessable();
        $this->postJson($url, [...$base, 'startDate' => '2026-11-02', 'deadline' => '2026-11-07', 'title' => 'Manual issue'])
            ->assertCreated()->assertJsonPath('data.title', 'MAN001 - Manual issue')->assertJsonPath('data.deadline', '2026-11-07')
            ->assertJsonPath('data.publishInfo.date', '2026-11-02')->assertJsonPath('data.publishInfo.time', '14:30');
    }

    public function test_pause_resume_archive_restore_are_optimistically_locked_and_preserve_children(): void
    {
        $actor = $this->actor();
        $series = $this->create($actor);
        $content = app(SeriesOccurrenceService::class)->createNext($actor, $series, app(SeriesOccurrenceService::class)->preview($series)['periodKey']);
        $series = $series->fresh();
        $pause = $this->postJson("/api/v1/content-series/{$series->id}/commands/pause", ['lockVersion' => $series->lock_version])
            ->assertOk()->assertJsonPath('data.status', 'paused');
        $this->postJson("/api/v1/content-series/{$series->id}/commands/resume", ['lockVersion' => $series->lock_version])
            ->assertConflict();
        $resume = $this->postJson("/api/v1/content-series/{$series->id}/commands/resume", ['lockVersion' => $pause->json('data.lockVersion')])
            ->assertOk()->assertJsonPath('data.status', 'active');
        $archive = $this->postJson("/api/v1/content-series/{$series->id}/commands/archive", ['lockVersion' => $resume->json('data.lockVersion')])
            ->assertOk()->assertJsonPath('data.status', 'archived');
        $this->postJson("/api/v1/content-series/{$series->id}/commands/restore", ['lockVersion' => $archive->json('data.lockVersion')])
            ->assertOk()->assertJsonPath('data.status', 'paused');
        $this->assertNotNull($content->fresh());
        $this->assertDatabaseHas('activity_logs', ['type' => 'series_archive']);
    }

    public function test_jalali_month_arithmetic_round_trips_and_clamps_invalid_day(): void
    {
        $calendar = app(PersianCalendar::class);
        $nowruz = CarbonImmutable::parse('2026-03-21');
        $this->assertSame(['year' => 1405, 'month' => 1, 'day' => 1], $calendar->fromGregorian($nowruz));
        $this->assertSame('2026-03-21', $calendar->toGregorian(1405, 1, 1)->toDateString());
        $anchor = $calendar->toGregorian(1403, 12, 30);
        $clamped = $calendar->addMonths($anchor, 12, 30);
        $this->assertSame(['year' => 1404, 'month' => 12, 'day' => 29], $calendar->fromGregorian($clamped));
    }

    public function test_project_based_schedule_distributes_plan_targets_across_the_real_project_window(): void
    {
        $actor = $this->actor();
        $project = Project::create([
            'name' => 'Campaign window', 'project_manager_id' => $actor->id, 'status' => 'active',
            'priority' => 'medium', 'tags' => [], 'start_date' => '2026-10-01', 'deadline' => '2026-12-15',
        ]);
        $project->members()->sync([$actor->id]);
        ProjectContentPlan::create([
            'project_id' => $project->id, 'content_type' => 'article', 'planned_count' => 3,
            'deadline' => '2026-11-30', 'created_by' => $actor->id,
        ]);
        $series = $this->create($actor, [
            'name' => 'Project plan', 'codePrefix' => 'PP', 'projectId' => $project->id,
            'recurrenceType' => 'project_based',
        ]);
        $service = app(SeriesOccurrenceService::class);
        $this->assertSame('2026-10-01', $service->preview($series, 1)['startDate']);
        $this->assertSame('2026-10-31', $service->preview($series, 2)['startDate']);
        $this->assertSame('2026-11-30', $service->preview($series, 3)['startDate']);
    }

    public function test_server_uses_canonical_template_and_rejects_unknown_content_type(): void
    {
        $actor = $this->actor();
        SystemSetting::create(['key' => 'content_types', 'value' => [['id' => 'article', 'name' => 'Article']]]);
        SystemSetting::create(['key' => 'process_templates', 'value' => [[
            'id' => 'editorial-v1', 'name' => 'Editorial', 'stages' => [[
                'stageKey' => 'draft', 'title' => 'Canonical draft', 'order' => 1, 'defaultRole' => 'writer',
                'inputs' => [], 'outputs' => [['id' => 'copy', 'name' => 'Copy', 'type' => 'text', 'isRequired' => true]],
                'checklist' => [['text' => 'Server snapshot']],
            ]],
        ]]]);
        $series = $this->create($actor, [
            'processTemplateId' => 'editorial-v1', 'applyTemplate' => true,
            'defaultContentPayload' => ['stages' => [['id' => 'forged', 'title' => 'Forged']]],
        ]);
        $stage = $series->default_content_payload['stages'][0];
        $this->assertSame('Canonical draft', $stage['title']);
        $this->assertSame('draft', $stage['stageKey']);
        $this->assertSame('Server snapshot', $stage['checklist'][0]['text']);

        $this->postJson('/api/v1/content-series', $this->payload($actor, ['name' => 'Bad type', 'codePrefix' => 'BAD', 'contentType' => 'unknown']))
            ->assertUnprocessable()->assertJsonValidationErrors('contentType');
    }

    public function test_workspace_summary_filters_schedule_and_operational_tabs_are_server_bounded(): void
    {
        $actor = $this->actor();
        $active = $this->create($actor, ['name' => 'Active editorial', 'codePrefix' => 'ACT']);
        $paused = $this->create($actor, ['name' => 'Paused editorial', 'codePrefix' => 'PAU']);
        $this->postJson("/api/v1/content-series/{$paused->id}/commands/pause", ['lockVersion' => 1])->assertOk();

        $this->getJson('/api/v1/content-series-summary')->assertOk()
            ->assertJsonPath('data.total', 2)->assertJsonPath('data.active', 1)->assertJsonPath('data.paused', 1);
        $this->getJson('/api/v1/content-series?status=active&search=Active&per_page=10')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', (string) $active->id);
        $this->getJson("/api/v1/content-series/{$active->id}/schedule-preview?count=3")
            ->assertOk()->assertJsonCount(3, 'data');
        $this->getJson("/api/v1/content-series/{$active->id}/revisions")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/content-series/{$active->id}/activity")->assertOk();
        $this->getJson("/api/v1/content-series/{$active->id}/integrity")->assertOk()->assertJsonPath('data.healthy', true);
    }

    public function test_historical_series_occurrences_receive_missing_publication_schedule_without_overwriting_defaults(): void
    {
        $actor = $this->actor();
        $series = ContentSeries::create([
            'name' => 'Legacy series', 'code_prefix' => 'LEGACY', 'content_type' => 'article',
            'owner_id' => $actor->id, 'created_by' => $actor->id, 'recurrence_type' => 'weekly',
            'recurrence_config' => ['activationTime' => '07:15'],
            'default_content_payload' => [],
            'default_publication_config' => ['time' => '16:45', 'channels' => ['website']],
        ]);
        $content = Content::create([
            'title' => 'Legacy occurrence', 'type' => 'article', 'status' => 'planning',
            'series_id' => $series->id, 'series_sequence' => 1, 'period_key' => 'legacy-1',
            'planned_start_at' => '2026-11-08 07:15:00',
            'payload' => ['publishInfo' => ['channels' => ['website'], 'status' => 'planned']],
        ]);

        $migration = require database_path('migrations/2026_10_05_000003_backfill_series_publication_schedule.php');
        $migration->up();

        $publication = $content->fresh()->payload['publishInfo'];
        $this->assertSame('2026-11-08', $publication['date']);
        $this->assertSame('16:45', $publication['time']);
        $this->assertSame(['website'], $publication['channels']);
    }

    public function test_reference_assets_become_real_dam_relations_and_task_notifications_reuse_existing_domains(): void
    {
        $actor = $this->actor();
        $asset = DamAsset::create([
            'type' => 'content', 'title' => 'Reference brief', 'status' => 'draft',
            'confidentiality' => 'internal', 'owner_id' => $actor->id, 'created_by' => $actor->id,
        ]);
        $series = $this->create($actor, [
            'defaultContentPayload' => [
                ...$this->payload($actor)['defaultContentPayload'], 'assetIds' => [(string) $asset->id],
            ],
        ]);
        $content = app(SeriesOccurrenceService::class)->createNext($actor, $series, app(SeriesOccurrenceService::class)->preview($series)['periodKey']);
        $this->assertDatabaseHas('dam_relations', [
            'asset_id' => $asset->id, 'related_type' => 'content', 'related_id' => $content->id, 'relation_type' => 'reference',
        ]);
        $this->assertTrue(DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)
            ->where('user_id', $actor->id)->exists());
    }
}
