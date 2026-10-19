<?php

namespace Tests\Feature;

use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingValueStore;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use App\Modules\Notifications\Services\NotificationRetention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-4 notification experience: accelerator columns, grouping,
 * category muting (mandatory/security excluded), scoped bulk read,
 * and the 90-day retention with archival.
 */
class NotificationsExperienceTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['username' => 'notif.user', 'status' => 'active']);
        app(SettingsRegistrySynchronizer::class)->sync(app(SettingsRegistry::class));
        Sanctum::actingAs($this->user);
    }

    private function notify(array $payload, int $daysAgo = 0): DomainRecord
    {
        $record = DomainRecord::create([
            'domain' => DomainRecord::DOMAIN_NOTIFICATION,
            'user_id' => $this->user->id,
            'title' => $payload['title'] ?? 'اعلان',
            'payload' => ['title' => $payload['title'] ?? 'اعلان', 'message' => 'متن', 'read' => false, ...$payload],
        ]);
        if ($daysAgo > 0) {
            DB::table('domain_records')->where('id', $record->id)->update(['created_at' => now()->subDays($daysAgo)]);
            $record->refresh();
        }

        return $record;
    }

    public function test_listing_exposes_columns_and_hook_fills_them(): void
    {
        $task = Task::create(['title' => 'وظیفهٔ آزمون', 'status' => 'backlog', 'assignee_id' => $this->user->id]);
        $record = $this->notify(['type' => 'status_change', 'notificationCategory' => 'tasks', 'linkTaskId' => (string) $task->id]);
        $this->assertSame('tasks', $record->fresh()->category_key);
        $this->assertSame('tasks:status_change:'.$task->id, $record->fresh()->group_key);
        $this->assertNull($record->fresh()->read_at);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.categoryKey', 'tasks')
            ->assertJsonPath('data.0.groupKey', 'tasks:status_change:'.$task->id)
            ->assertJsonPath('meta.unread_count', 1)
            ->assertJsonPath('meta.unread_count_all', 1);
    }

    public function test_grouped_listing_aggregates_without_merging_read_state(): void
    {
        $taskA = Task::create(['title' => 'الف', 'status' => 'backlog', 'assignee_id' => $this->user->id]);
        $taskB = Task::create(['title' => 'ب', 'status' => 'backlog', 'assignee_id' => $this->user->id]);
        $this->notify(['type' => 'comment', 'notificationCategory' => 'collaboration', 'linkTaskId' => (string) $taskA->id]);
        $this->notify(['type' => 'comment', 'notificationCategory' => 'collaboration', 'linkTaskId' => (string) $taskA->id, 'read' => true]);
        $this->notify(['type' => 'deadline', 'notificationCategory' => 'tasks', 'linkTaskId' => (string) $taskB->id]);

        $response = $this->getJson('/api/v1/notifications?grouped=1')->assertOk();
        $groups = collect($response->json('data'));
        $this->assertSame(2, $groups->count());
        $comments = $groups->firstWhere('group_key', 'collaboration:comment:'.$taskA->id);
        $this->assertSame(2, $comments['count']);
        $this->assertSame(1, $comments['unread_count']);

        // Drilling into a group keeps per-record rows.
        $this->getJson('/api/v1/notifications?group_key=collaboration:comment:'.$taskA->id)
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_muting_excludes_ordinary_categories_from_badge_but_never_system(): void
    {
        $this->notify(['type' => 'deadline', 'notificationCategory' => 'tasks']);
        $this->notify(['type' => 'announcement', 'notificationCategory' => 'system']);

        app(SettingValueStore::class)->put('user', (int) $this->user->id, 'user.experience.notification_mutes', json_encode(['tasks', 'system']));

        $meta = $this->getJson('/api/v1/notifications')->assertOk()->json('meta');
        $this->assertSame(1, $meta['unread_count'], 'system stays counted, tasks muted');
        $this->assertSame(2, $meta['unread_count_all']);
        $this->assertSame(['tasks'], $meta['muted_categories'], 'system can never be effectively muted');
    }

    public function test_scoped_read_all_respects_category_and_never_touches_mandatory(): void
    {
        $task = $this->notify(['type' => 'deadline', 'notificationCategory' => 'tasks']);
        $content = $this->notify(['type' => 'review', 'notificationCategory' => 'content']);
        $mandatory = $this->notify(['type' => 'announcement', 'notificationCategory' => 'system', 'mandatory' => true]);
        $security = $this->notify(['type' => 'security_alert', 'notificationCategory' => 'system']);

        $this->postJson('/api/v1/notifications/read-all', ['category' => 'tasks'])->assertOk()->assertJsonPath('data.updated', 1);
        $this->assertTrue($task->fresh()->payload['read']);
        $this->assertNotNull($task->fresh()->read_at);
        $this->assertFalse($content->fresh()->payload['read']);

        $this->postJson('/api/v1/notifications/read-all')->assertOk();
        $this->assertTrue($content->fresh()->payload['read']);
        $this->assertFalse($mandatory->fresh()->payload['read'], 'mandatory rows are never bulk-read');
        $this->assertFalse($security->fresh()->payload['read'], 'security rows are never bulk-read');
    }

    public function test_retention_deletes_read_archives_unread_and_exempts_mandatory(): void
    {
        $readOld = $this->notify(['type' => 'deadline', 'notificationCategory' => 'tasks', 'read' => true], 100);
        $unreadOld = $this->notify(['type' => 'comment', 'notificationCategory' => 'collaboration'], 100);
        $mandatoryOld = $this->notify(['type' => 'announcement', 'notificationCategory' => 'system', 'mandatory' => true], 100);
        $fresh = $this->notify(['type' => 'deadline', 'notificationCategory' => 'tasks'], 89);

        $result = app(NotificationRetention::class)->run();
        $this->assertSame(1, $result['deleted']);
        $this->assertSame(1, $result['archived']);
        $this->assertSame(1, $result['exempt']);

        $this->assertDatabaseMissing('domain_records', ['id' => $readOld->id]);
        $this->assertDatabaseMissing('domain_records', ['id' => $unreadOld->id]);
        $this->assertDatabaseHas('notification_archives', ['user_id' => $this->user->id]);
        $this->assertDatabaseHas('domain_records', ['id' => $mandatoryOld->id]);
        $this->assertDatabaseHas('domain_records', ['id' => $fresh->id]);

        // Idempotent: a second run changes nothing.
        $second = app(NotificationRetention::class)->run();
        $this->assertSame(0, $second['deleted']);
        $this->assertSame(0, $second['archived']);
    }

    public function test_backfill_command_fills_columns_for_legacy_rows(): void
    {
        $record = $this->notify(['type' => 'reply', 'notificationCategory' => 'collaboration', 'linkContentId' => '5', 'read' => true]);
        DB::table('domain_records')->where('id', $record->id)->update(['group_key' => null, 'category_key' => null, 'read_at' => null]);

        $this->assertSame(0, Artisan::call('notifications:backfill-columns'));
        $fresh = $record->fresh();
        $this->assertSame('collaboration', $fresh->category_key);
        $this->assertSame('collaboration:reply:5', $fresh->group_key);
        $this->assertNotNull($fresh->read_at);
    }
}
