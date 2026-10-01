<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Meetings\MeetingReminders;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\OperationsSchema;
use App\Bot\Bale\Support\PersianDate;
use App\Models\BaleConversation;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\TaskOperations;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class BaleExperienceTest extends TestCase
{
    use BaleTestSupport, DatabaseMigrations;

    public function runDatabaseMigrations(): void
    {
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    private function grant(User $user, array $keys): void
    {
        $role = Role::create(['key' => 'experience_'.$user->id.'_'.Str::random(5), 'name' => 'کارشناس آزمون']);
        foreach ($keys as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user->update(['role_id' => $role->id]);
        $user->unsetRelation('role');
    }

    private function meeting(User $owner, array $attendees = [], string $title = 'جلسه مجاز'): WorkspaceRecord
    {
        return WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_MEETING, 'owner_id' => $owner->id, 'title' => $title, 'status' => 'scheduled', 'payload' => ['attendeeIds' => $attendees, 'date' => '2026-09-28', 'time' => '۱۰:۳۰', 'duration' => '۹۰ دقیقه', 'locationDetails' => 'اتاق یک', 'agenda' => [['title' => 'مرور کارها']]]]);
    }

    public function test_menu_profile_and_textual_task_list_have_requested_identity(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        $this->grant($user, ['tasks.view', 'assets.view']);
        $task = $this->task($user, '*عنوان تست*');
        $task->update(['deadline' => '2026-09-28']);
        $this->tick([$this->buttonUpdate(1, 'home')]);
        $buttons = json_encode(end($this->sent)['reply_markup'], JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('پروژه‌های من', $buttons);
        $this->assertStringNotContainsString('راهنما', $buttons);
        $this->tick([$this->buttonUpdate(2, 'profile')]);
        $this->assertStringContainsString('کارشناس آزمون', end($this->sent)['text']);
        $before = count($this->sent);
        $this->tick([$this->buttonUpdate(3, 'tasks')]);
        $this->assertCount($before + 1, $this->sent);
        $this->assertStringContainsString('۱۴۰۵/۰۷/۰۶', end($this->sent)['text']);
        $this->assertStringContainsString('＊عنوان تست＊', end($this->sent)['text']);
        $this->assertStringContainsString('جزئیات تسک', json_encode(end($this->sent), JSON_UNESCAPED_UNICODE));
        $this->tick([$this->buttonUpdate(4, 'task:'.$task->id)]);
        $this->assertStringContainsString('📌 *', end($this->sent)['text']);
        $this->assertStringContainsString('taskasset:'.$task->id, json_encode(end($this->sent)));
        $this->assertStringContainsString('status:'.$task->id, json_encode(end($this->sent)));
    }

    public function test_meetings_are_scoped_by_current_membership_and_have_detail_buttons(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['meetings.view']);
        $this->link($user);
        $other = $this->user();
        $mine = $this->meeting($user);
        $invited = $this->meeting($other, [(string) $user->id], 'جلسه دعوت‌شده');
        $numeric = $this->meeting($other, [$user->id], 'دعوت عددی');
        $hidden = $this->meeting($other, [], 'جلسه بیگانه');
        $this->tick([$this->buttonUpdate(1, 'meetings')]);
        $body = end($this->sent)['text'];
        $this->assertStringContainsString($mine->title, $body);
        $this->assertStringContainsString($invited->title, $body);
        $this->assertStringContainsString($numeric->title, $body);
        $this->assertStringNotContainsString($hidden->title, $body);
        $this->tick([$this->buttonUpdate(2, 'meeting:'.$invited->id)]);
        $this->assertStringContainsString('مرور کارها', end($this->sent)['text']);
        $this->assertStringContainsString('۱۴۰۵/۰۷/۰۶', end($this->sent)['text']);
        $invited->update(['payload' => ['attendeeIds' => []]]);
        $this->tick([$this->buttonUpdate(3, 'meeting:'.$invited->id), $this->buttonUpdate(4, 'meeting:'.$hidden->id)]);
        $this->assertStringNotContainsString('جلسه بیگانه', end($this->sent)['text']);
        $this->assertStringNotContainsString('جلسه دعوت‌شده', $this->sent[count($this->sent) - 2]['text']);
    }

    public function test_pending_meeting_text_is_not_sent_after_invitation_is_revoked(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['meetings.view']);
        $link = $this->link($user);
        $meeting = $this->meeting($this->user(), [$user->id]);
        $pending = app(Outbox::class)->enqueue('pending-meeting', '991', ['text' => 'secret meeting'], $link, 'meetings', null);
        $pending->update(['payload' => ['text' => 'secret meeting', '_subject_ids' => [$meeting->id]]]);
        $meeting->update(['payload' => ['attendeeIds' => []]]);
        $this->tick([]);
        $this->assertSame('cancelled', $pending->fresh()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_missing_reminder_table_returns_repair_guidance_without_sql_or_writes(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['meetings.view', 'meetings.edit']);
        $this->link($user);
        $meeting = $this->meeting($user);
        Schema::drop('bale_reminder_runs');
        Sanctum::actingAs($user);
        $response = $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', ['request_id' => (string) Str::uuid(), 'version' => MeetingReminders::snapshot($meeting), 'confirm' => true])->assertStatus(503);
        $response->assertJsonPath('message', OperationsSchema::MESSAGE);
        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        $this->assertDatabaseCount('domain_records', 0);
        $this->getJson('/api/v1/bale/account')->assertOk()->assertJsonPath('data.installation_ready', false);
        // Reading meetings is independent of reminder installation.
        $this->tick([$this->buttonUpdate(1, 'meetings')]);
        $this->assertStringContainsString($meeting->title, end($this->sent)['text']);
    }

    public function test_missing_notification_preference_keeps_api_error_and_stale_menu_returns_home(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        Schema::table('bale_user_links', fn ($t) => $t->dropColumn('notifications_enabled'));
        Sanctum::actingAs($user);
        $this->putJson('/api/v1/bale/account/preferences', ['notifications_enabled' => true])->assertStatus(503)->assertJsonPath('message', OperationsSchema::MESSAGE);
        $this->tick([$this->buttonUpdate(1, 'notifications')]);
        $this->assertStringContainsString('به تدبیر خوش آمدید', end($this->sent)['text']);
    }

    public function test_notification_test_is_self_only_opt_in_rate_limited_and_deduplicated(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        Sanctum::actingAs($user);
        $payload = ['request_id' => (string) Str::uuid(), 'user_id' => $this->user()->id];
        $this->postJson('/api/v1/bale/account/test-notification', $payload)->assertOk()->assertJsonPath('data.status', 'sent');
        $this->postJson('/api/v1/bale/account/test-notification', $payload)->assertOk();
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertCount(1, $this->sent);
        $this->assertSame($user->id, DomainRecord::first()->user_id);
        $link->update(['notifications_enabled' => false]);
        $this->postJson('/api/v1/bale/account/test-notification', ['request_id' => (string) Str::uuid()])->assertUnprocessable();
        $this->postJson('/api/v1/bale/account/test-notification', ['request_id' => (string) Str::uuid()])->assertStatus(429);
    }

    public function test_text_asset_has_preview_private_storage_task_relation_and_replay_safe_confirmation(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'taskasset:'.$task->id)]);
        $this->assertStringContainsString('assetfile:'.$task->id, json_encode(end($this->sent), JSON_UNESCAPED_SLASHES));
        $this->tick([$this->buttonUpdate(2, 'assettext:'.$task->id), $this->message(3, 'یادداشت'), $this->message(4, 'متن جدید')]);
        $this->assertDatabaseCount('dam_assets', 0);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(5, 'confirm:'.$nonce), $this->buttonUpdate(6, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 1);
        $asset = DamAsset::first();
        $this->assertSame('content', $asset->type);
        $this->assertSame('confidential', $asset->confidentiality);
        $this->assertSame('متن جدید', $asset->contentItem->content_body);
        $this->assertTrue($asset->relations()->where('related_type', 'task')->where('related_id', $task->id)->exists());
        foreach ($this->sent as $sent) {
            $this->assertArrayNotHasKey('_task_id', $sent);
            $this->assertArrayNotHasKey('_asset_text', $sent);
        }
        $this->assertSame(1, $asset->versions()->count());
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_asset_confirmation_rechecks_assignment_and_upload_permission(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'assettext:'.$task->id), $this->message(2, 'عنوان'), $this->message(3, 'محتوا')]);
        $nonce = BaleConversation::first()->nonce;
        $task->update(['assignee_id' => $this->user()->id]);
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 0);
        $task->update(['assignee_id' => $user->id]);
        $this->tick([$this->buttonUpdate(5, 'assettext:'.$task->id), $this->message(6, 'عنوان'), $this->message(7, 'محتوا')]);
        $nonce = BaleConversation::first()->nonce;
        $this->grant($user, ['tasks.view', 'assets.view']);
        $this->tick([$this->buttonUpdate(8, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 0);
    }

    public function test_asset_cancel_and_expiry_do_not_create_domain_records(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'assettext:'.$task->id), $this->message(2, 'عنوان'), $this->message(3, 'محتوا')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'cancel'), $this->buttonUpdate(5, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 0);
        $this->tick([$this->buttonUpdate(6, 'assettext:'.$task->id), $this->message(7, 'عنوان'), $this->message(8, 'محتوا')]);
        $nonce = BaleConversation::first()->nonce;
        $this->travel(11)->minutes();
        $this->tick([$this->buttonUpdate(9, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 0);
        $this->travelBack();
    }

    public function test_table_row_started_from_task_keeps_task_relation_through_department_selection(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $this->link($user);
        $task = $this->task($user);
        $department = Department::create(['name' => 'تیم', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'جدول', 'created_by' => $user->id, 'columns' => [['id' => 'name', 'name' => 'نام', 'type' => 'text']]]);
        $table->departments()->attach($department);
        $this->tick([$this->buttonUpdate(1, 'assetrows:'.$task->id), $this->buttonUpdate(2, 'departmenttables:'.$department->id.':0'), $this->buttonUpdate(3, 'departmentform:'.$department->id.':'.$table->id), $this->message(4, 'ثبت')]);
        $this->assertSame($task->id, BaleConversation::first()->data['task_id']);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(5, 'confirm:'.$nonce)]);
        $this->assertDatabaseHas('dam_data_rows', ['task_id' => $task->id, 'table_id' => $table->id]);
    }

    public function test_status_service_enforces_current_view_assignment_and_content_workflow_for_bale(): void
    {
        $user = $this->user();
        $task = $this->task($user);
        $ops = app(TaskOperations::class);
        $this->assertNotEmpty($ops->allowedStatuses($user, $task)); // existing assignee rule, not a new global grant
        $this->grant($user, ['tasks.status']);
        $this->assertSame([], $ops->allowedStatuses($user, $task));
        $this->grant($user, ['tasks.view', 'tasks.status']);
        $task->update(['kind' => 'content']);
        try {
            $ops->changeStatus($user, $task, 'completed', 'backlog', 'bale');
            $this->fail('Content workflow was bypassed');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $task->update(['kind' => 'general', 'assignee_id' => $this->user()->id]);
        try {
            $ops->changeStatus($user, $task, 'completed', 'backlog', 'bale');
            $this->fail('Other assignee allowed');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $this->assertSame('backlog', $task->fresh()->status);
    }

    public function test_panel_upload_uses_authenticated_existing_dam_path_and_task_relation(): void
    {
        Storage::fake('local');
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $task = $this->task($user);
        $this->postJson('/api/v1/dam/library', ['title' => 'file', 'task_id' => $task->id])->assertUnauthorized();
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/dam/library', ['title' => 'file', 'task_id' => $task->id, 'file' => UploadedFile::fake()->create('report.txt', 1, 'text/plain'), 'confidentiality' => 'confidential'])->assertCreated();
        $asset = DamAsset::first();
        $this->assertSame('file', $asset->type);
        $this->assertTrue($asset->relations()->where('related_type', 'task')->where('related_id', $task->id)->exists());
        Storage::disk('local')->assertExists($asset->latestFile->storage_path);
        $this->postJson('/api/v1/dam/library', ['title' => 'bad', 'task_id' => $task->id, 'file' => UploadedFile::fake()->create('evil.php', 1)])->assertUnprocessable();
        $this->grant($user, ['assets.view', 'assets.upload']);
        Sanctum::actingAs($user->fresh());
        $this->postJson('/api/v1/dam/library', ['title' => 'forbidden', 'task_id' => $task->id, 'body' => 'x'])->assertForbidden();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $user->update(['status' => 'inactive']);
        Sanctum::actingAs($user->fresh());
        $this->postJson('/api/v1/dam/library', ['title' => 'inactive', 'task_id' => $task->id, 'body' => 'x'])->assertForbidden();
        $this->assertDatabaseCount('dam_assets', 1);
    }

    public function test_status_confirmation_rejects_a_stale_task_or_revoked_view_permission(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'status:'.$task->id)]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(2, 'choose:'.$nonce.':completed')]);
        $task->update(['status' => 'in_progress']);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame('in_progress', $task->fresh()->status);
        $this->tick([$this->buttonUpdate(4, 'status:'.$task->id)]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(5, 'choose:'.$nonce.':completed')]);
        $this->grant($user, ['tasks.status']);
        $this->tick([$this->buttonUpdate(6, 'confirm:'.$nonce)]);
        $this->assertSame('in_progress', $task->fresh()->status);
    }

    public function test_pending_text_asset_and_task_table_preview_recheck_permissions(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $link = $this->link($user);
        $task = $this->task($user);
        $text = app(Outbox::class)->enqueue('pending-text', '991', ['text' => 'private text', '_asset_text' => true], $link, 'task', $task->id);
        $this->grant($user, ['tasks.view', 'assets.view']);
        $this->tick([]);
        $this->assertSame('cancelled', $text->fresh()->status);
        $row = app(Outbox::class)->enqueue('pending-row', '991', ['text' => 'private row', '_task_id' => $task->id], $link, 'asset_departments');
        $task->update(['assignee_id' => $this->user()->id]);
        $this->tick([]);
        $this->assertSame('cancelled', $row->fresh()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_reference_link_is_validated_and_saved_as_private_text_without_remote_download(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'assets.view', 'assets.upload']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'asseturl:'.$task->id), $this->message(2, 'مرجع'), $this->message(3, 'javascript:alert(1)')]);
        $this->assertSame('text_asset_body', BaleConversation::first()->step);
        $this->tick([$this->message(4, 'https://user:password@example.test/private')]);
        $this->assertSame('text_asset_body', BaleConversation::first()->step);
        $this->tick([$this->message(5, 'https://example.test/reference.pdf')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(6, 'confirm:'.$nonce)]);
        $asset = DamAsset::first();
        $this->assertNotNull($asset);
        $this->assertSame('content', $asset->type);
        $this->assertSame('https://example.test/reference.pdf', $asset->contentItem->content_body);
        $this->assertSame(0, $asset->files()->count());
    }

    public function test_jalali_dates_cover_new_year_leap_day_and_existing_persian_meetings(): void
    {
        foreach (['2026-09-28' => '۱۴۰۵/۰۷/۰۶', '2026-03-21' => '۱۴۰۵/۰۱/۰۱', '2025-03-20' => '۱۴۰۳/۱۲/۳۰', '2025-03-21' => '۱۴۰۴/۰۱/۰۱', '1405/7/6' => '۱۴۰۵/۰۷/۰۶', '۱۴۰۵/۰۷/۰۶' => '۱۴۰۵/۰۷/۰۶'] as $input => $expected) {
            $this->assertSame($expected, PersianDate::format($input));
        }
        $this->assertSame('تعیین نشده', PersianDate::format(null));
        $this->assertSame('تاریخ نامعتبر', PersianDate::format('2026-02-30'));
    }

    public function test_old_team_callback_cannot_be_reinterpreted_as_a_department_callback(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['assets.view', 'assets.upload']);
        $this->link($user);
        $department = Department::create(['name' => 'خصوصی', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'جدول', 'columns' => [['id' => 'title', 'name' => 'عنوان', 'type' => 'text']], 'created_by' => $user->id]);
        $table->departments()->attach($department);
        $this->tick([$this->buttonUpdate(1, 'assetform:'.$department->id.':'.$table->id), $this->buttonUpdate(2, 'assetstables:'.$department->id.':0')]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertDatabaseCount('dam_data_rows', 0);
    }
}
