<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\ContentPublication;
use App\Services\SeriesOccurrenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * ادامهٔ زمان‌بندی مجموعه از تاریخ **واقعی** دورهٔ قبل.
 *
 * سناریوی گزارش‌شده: یک دوره از مجموعه حذف/منتشر نمی‌شود و کاربر انتشارِ آن را
 * به هفتهٔ بعد منتقل می‌کند. پیش‌تر محاسبه فقط از تاریخ شروعِ مجموعه انجام
 * می‌شد، پس دورهٔ بعدی دوباره روی همان روز می‌افتاد و کاربر ناچار بود تاریخِ همهٔ
 * دوره‌های بعدی را دستی تعیین کند.
 */
class SeriesScheduleContinuationTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private const PERMISSIONS = ['content.view', 'content.create', 'content.edit', 'content.delete', 'content.publish', 'tasks.view'];

    private function actor(): User
    {
        $role = Role::create(['key' => 'admin', 'name' => 'admin', 'is_active' => true]);
        foreach (self::PERMISSIONS as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => 'admin']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function series(array $override = []): ContentSeries
    {
        $payload = [...[
            'name' => 'هفتگی روایت', 'description' => '', 'codePrefix' => 'WE', 'contentType' => 'article',
            'recurrenceType' => 'weekly',
            'recurrenceConfig' => ['startDate' => '2026-10-05', 'interval' => 1, 'deadlineOffsetDays' => 3],
            'defaultContentPayload' => ['tags' => [], 'assetIds' => [], 'stages' => [[
                'id' => 'write', 'stageKey' => 'write', 'title' => 'نگارش', 'description' => '', 'departmentId' => '',
                'departmentName' => '', 'order' => 1, 'relativeDueDays' => 2, 'status' => 'not_started',
                'reviewRequired' => false, 'assigneeId' => null, 'inputs' => [], 'outputs' => [], 'checklist' => [],
            ]]],
        ], ...$override];
        $id = $this->postJson('/api/v1/content-series', $payload)->assertCreated()->json('data.id');

        return ContentSeries::findOrFail($id);
    }

    /** مجموعهٔ آینده‌محور: دوره‌ها هنوز فعال نشده‌اند (تسکی ساخته نشده). */
    private function futureSeries(): ContentSeries
    {
        return $this->series(['recurrenceConfig' => ['startDate' => '2030-01-07', 'interval' => 1, 'deadlineOffsetDays' => 3]]);
    }

    private function createNext(User $actor, ContentSeries $series): Content
    {
        $service = app(SeriesOccurrenceService::class);

        return $service->createNext($actor, $series->fresh(), $service->preview($series->fresh())['periodKey']);
    }

    /** انتقال تاریخ انتشار از همان مسیر واقعی رابط (تنظیمات انتشار). */
    private function movePublication(User $actor, Content $content, string $date): void
    {
        $this->putJson('/api/v1/contents/'.$content->id.'/publication-settings', [
            'expectedVersion' => ContentPublication::version($content->refresh()),
            'publishInfo' => ['date' => $date, 'time' => '10:00', 'status' => 'planned'],
        ])->assertOk();
    }

    public function test_next_occurrence_follows_the_moved_publication_date_of_the_previous_one(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        $this->assertSame('2026-10-05', $first->payload['publishInfo']['date']);

        // انتشار دورهٔ اول به هفتهٔ بعد منتقل می‌شود.
        $this->movePublication($actor, $first, '2026-10-12');

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-10-19', $preview['publicationDate'], 'دورهٔ بعدی باید یک هفته بعد از تاریخ منتقل‌شده باشد.');
        $this->assertSame('2026-10-19', $preview['startDate']);
        $this->assertSame('2026-10-22', $preview['deadline']);
        $this->assertTrue($preview['continuation']['shifted']);
        $this->assertSame(7, $preview['continuation']['shiftDays']);
        $this->assertSame(1, $preview['continuation']['sequence']);

        // ایجاد واقعی هم همان تاریخ را می‌گیرد و روی روز قبلی نمی‌افتد.
        $second = $this->createNext($actor, $series);
        $this->assertSame('2026-10-19', $second->payload['publishInfo']['date']);
        $this->assertNotSame($first->payload['publishInfo']['date'], $second->payload['publishInfo']['date']);
    }

    public function test_the_shift_keeps_the_weekly_cadence_for_every_later_occurrence(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        $this->movePublication($actor, $first, '2026-10-12');

        $service = app(SeriesOccurrenceService::class);
        $range = $service->previewRange($series->fresh(), 3);
        $this->assertSame(['2026-10-19', '2026-10-26', '2026-11-02'], array_column($range, 'publicationDate'));

        $second = $this->createNext($actor, $series);
        $third = $this->createNext($actor, $series);
        $this->assertSame('2026-10-26', $third->payload['publishInfo']['date']);
        $this->assertNotSame($second->payload['publishInfo']['date'], $third->payload['publishInfo']['date']);
    }

    public function test_a_batch_after_a_move_continues_week_by_week_without_duplicate_days(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        $this->movePublication($actor, $first, '2026-10-12');

        $batch = app(SeriesOccurrenceService::class)->createBatch($actor, $series->fresh(), 'cf6d3d76-1f2e-4d1a-9f6b-9a2a7e6f1b11', 3);
        $dates = $batch->map(fn (Content $content) => $content->payload['publishInfo']['date'])->all();

        $this->assertSame(['2026-10-19', '2026-10-26', '2026-11-02'], $dates);
        $this->assertSame($dates, array_values(array_unique($dates)), 'هیچ دو پرونده‌ای هم‌روز نیست.');
    }

    public function test_a_deleted_occurrence_never_reuses_a_day_that_already_has_a_content(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        $second = $this->createNext($actor, $series);
        $this->assertSame('2026-10-12', $second->payload['publishInfo']['date']);

        // دورهٔ دوم (این هفته) منتشر نمی‌شود و انتشارش به هفتهٔ بعد می‌رود؛ سپس
        // خودش حذف می‌شود و دورهٔ بعدی ساخته می‌شود.
        $this->movePublication($actor, $second, '2026-10-19');
        $second->delete();

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-10-19', $preview['publicationDate'], 'دورهٔ بعدی روی هفتهٔ دورهٔ قبلی نمی‌افتد.');
        $this->assertNotSame($first->payload['publishInfo']['date'], $preview['publicationDate']);
    }

    public function test_a_planned_future_occurrence_is_never_scheduled_on_the_same_day(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $batch = app(SeriesOccurrenceService::class)->createBatch($actor, $series->fresh(), '5a0f0f6e-6d4b-4b1e-8a4c-2d1b6b0d5e21', 3);
        $this->assertSame(['2026-10-05', '2026-10-12', '2026-10-19'], $batch->map(fn (Content $content) => $content->payload['publishInfo']['date'])->all());

        // دورترین دوره به هفتهٔ بعد منتقل می‌شود؛ دورهٔ تازه نباید روی همان روز بیاید.
        $this->movePublication($actor, $batch->last(), '2026-10-26');

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-11-02', $preview['publicationDate']);
        $existing = Content::where('series_id', $series->id)->get()
            ->map(fn (Content $content) => $content->payload['publishInfo']['date'])->all();
        $this->assertNotContains($preview['publicationDate'], $existing);
    }

    /** جابه‌جایی انتشار یک دوره، دوره‌های بعدیِ برنامه‌ریزی‌شده را هم می‌برد. */
    public function test_moving_one_occurrence_shifts_the_later_planned_ones(): void
    {
        $actor = $this->actor();
        $series = $this->futureSeries();
        $batch = app(SeriesOccurrenceService::class)->createBatch($actor, $series->fresh(), '0f0e4b62-6a7c-4bd6-9c9e-9f4b8b1c2d33', 3);
        [$first, $second, $third] = $batch->all();

        $response = $this->putJson('/api/v1/contents/'.$first->id.'/publication-settings', [
            'expectedVersion' => ContentPublication::version($first->refresh()),
            'publishInfo' => ['date' => '2030-01-14', 'time' => '10:00', 'status' => 'planned'],
        ])->assertOk();
        $response->assertJsonPath('meta.shiftedOccurrences', 2)->assertJsonPath('meta.shiftedDays', 7);

        $dates = Content::where('series_id', $series->id)->orderBy('series_sequence')->get()
            ->map(fn (Content $content) => $content->payload['publishInfo']['date'])->all();
        $this->assertSame(['2030-01-14', '2030-01-21', '2030-01-28'], $dates);
        foreach ([$second, $third] as $content) {
            $content->refresh();
            $this->assertSame($content->payload['publishInfo']['date'], $content->payload['stages'][0]['startDate']);
        }
        $this->assertDatabaseHas('activity_logs', ['type' => 'series_plan_shifted']);
    }

    public function test_an_activated_or_published_occurrence_is_never_shifted(): void
    {
        $actor = $this->actor();
        $series = $this->futureSeries();
        $batch = app(SeriesOccurrenceService::class)->createBatch($actor, $series->fresh(), '7c9a3e10-5b2c-4a8e-9a1b-3c7d5e9f0a12', 3);
        [$first, $second, $third] = $batch->all();
        // دورهٔ دوم شروع شده است: کارش در جریان است و نباید بی‌خبر جابه‌جا شود.
        $second->update(['series_activated_at' => now(), 'status' => 'in_progress']);

        $this->putJson('/api/v1/contents/'.$first->id.'/publication-settings', [
            'expectedVersion' => ContentPublication::version($first->refresh()),
            'publishInfo' => ['date' => '2030-01-14', 'time' => '10:00', 'status' => 'planned'],
        ])->assertOk()->assertJsonPath('meta.shiftedOccurrences', 1);

        $this->assertSame('2030-01-14', $second->refresh()->payload['publishInfo']['date']);
        $this->assertSame('2030-01-28', $third->refresh()->payload['publishInfo']['date']);
    }

    public function test_an_unmoved_series_keeps_its_original_cadence(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $this->createNext($actor, $series);

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-10-12', $preview['publicationDate']);
        $this->assertFalse($preview['continuation']['shifted']);
        $this->assertSame(0, $preview['continuation']['shiftDays']);
        $this->assertSame(['2026-10-12', '2026-10-19'], array_column(app(SeriesOccurrenceService::class)->previewRange($series->fresh(), 2), 'publicationDate'));
    }

    public function test_moving_an_older_occurrence_does_not_rewrite_the_schedule_of_the_latest_one(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        $second = $this->createNext($actor, $series);
        $this->assertSame('2026-10-12', $second->payload['publishInfo']['date']);

        $this->movePublication($actor, $first, '2026-10-08');

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-10-19', $preview['publicationDate'], 'مبدأ، تاریخِ واقعیِ آخرین دوره است.');
        $this->assertFalse($preview['continuation']['shifted']);
    }

    public function test_a_backward_move_never_pulls_the_next_occurrence_before_the_plan(): void
    {
        $actor = $this->actor();
        $series = $this->series();
        $first = $this->createNext($actor, $series);
        // یک هفته عقب‌تر از برنامه.
        $this->movePublication($actor, $first, '2026-09-28');

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-10-12', $preview['publicationDate'], 'زمان‌بندی به گذشته کشیده نمی‌شود.');
    }

    public function test_monthly_series_continues_from_the_moved_month(): void
    {
        $actor = $this->actor();
        $series = $this->series([
            'recurrenceType' => 'monthly',
            'recurrenceConfig' => ['startDate' => '2026-01-15', 'interval' => 1, 'deadlineOffsetDays' => 3, 'calendar' => 'gregorian'],
        ]);
        $first = $this->createNext($actor, $series);
        $this->assertSame('2026-01-15', $first->payload['publishInfo']['date']);

        $this->movePublication($actor, $first, '2026-02-15');

        $preview = app(SeriesOccurrenceService::class)->preview($series->fresh());
        $this->assertSame('2026-03-15', $preview['publicationDate'], 'دورهٔ بعدی یک ماه بعد از تاریخ منتقل‌شده است.');
        $this->assertTrue($preview['continuation']['shifted']);
    }
}
