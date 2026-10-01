<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Meetings\MeetingReminders;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\Content;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\DamTableAccess;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BaleOperationsTest extends TestCase
{
    use BaleTestSupport, DatabaseMigrations;

    public function runDatabaseMigrations(): void
    {
        // Real commits are required for afterCommit tests. Rebuild each isolated DB;
        // do not run the unrelated legacy DAM SQLite down() with its dangling index.
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    private function grant(User $user, array $permissions): void
    {
        $role = Role::create(['key' => 'operation_'.$user->id.'_'.Str::random(5), 'name' => 'Operations']);
        foreach ($permissions as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $role->permissions()->attach($permission);
        }
        $user->update(['role_id' => $role->id]);
        $user->unsetRelation('role');
    }

    private function notification(User $user, array $extra = []): array
    {
        return [...['id' => 'notif-'.Str::uuid(), 'userId' => (string) $user->id, 'title' => 'اعلان جدید', 'message' => 'متن آزمایشی', 'type' => 'info'], ...$extra];
    }

    private function meeting(User $owner, array $attendees = []): WorkspaceRecord
    {
        return WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_MEETING, 'owner_id' => $owner->id, 'title' => 'جلسه آزمایشی', 'status' => 'scheduled',
            'payload' => ['organizerId' => (string) $owner->id, 'attendeeIds' => $attendees, 'date' => '1405/07/10', 'time' => '10:00', 'locationDetails' => 'اتاق جلسات']]);
    }

    private function asset(User $user, array $columns = []): array
    {
        $this->grant($user, ['assets.view', 'assets.upload']);
        $department = Department::create(['name' => 'Department', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'Assets', 'created_by' => $user->id, 'columns' => $columns ?: [['id' => 'name', 'name' => 'نام', 'type' => 'text', 'required' => true]]]);
        $table->departments()->attach($department);

        return [$department, $table];
    }

    public function test_creation_sends_without_polling_and_is_idempotent_with_registered_webhook(): void
    {
        $this->ready();
        app(Settings::class)->write(['remote_webhook_present' => true]);
        $user = $this->user();
        $this->link($user);
        Sanctum::actingAs($user);
        $data = $this->notification($user);
        $first = $this->postJson('/api/v1/notifications', $data)->assertCreated();
        $this->postJson('/api/v1/notifications', $data)->assertCreated()->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertDatabaseCount('bale_outbox', 1);
        $this->assertSame(['sendMessage'], $this->methods);
        $this->assertSame('sent', BaleOutbox::first()->status);
    }

    public function test_failed_external_send_keeps_internal_notification_and_unknown_is_never_replayed(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        Sanctum::actingAs($user);
        $this->failure = 'timeout';
        $this->postJson('/api/v1/notifications', $this->notification($user))->assertCreated();
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertSame('unknown', BaleOutbox::first()->status);
        $this->failure = null;
        app(NotificationDelivery::class)->sendNow();
        $this->assertCount(1, $this->sent);
    }

    public function test_notification_recipient_cannot_be_forged_or_reassigned(): void
    {
        $this->ready();
        $user = $this->user();
        $other = $this->user();
        $this->link($other);
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/notifications', $this->notification($other))->assertForbidden();
        $id = $this->postJson('/api/v1/notifications', $this->notification($user))->assertCreated()->json('data.id');
        $this->putJson('/api/v1/notifications/'.$id, ['userId' => $other->id, 'read' => true, 'message' => 'injected'])->assertOk();
        $record = DomainRecord::find($id);
        $this->assertSame($user->id, $record->user_id);
        $this->assertNotSame('injected', $record->payload['message']);
        $this->assertTrue($record->payload['read']);
        $this->assertCount(0, $this->sent);
    }

    public function test_rollback_never_sends_and_rolls_back_the_outbox(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        DB::beginTransaction();
        DomainRecord::create(['domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $user->id, 'title' => 'Rollback', 'payload' => ['message' => 'private']]);
        $this->assertCount(0, $this->sent);
        $this->assertDatabaseCount('bale_outbox', 1);
        DB::rollBack();
        $this->assertDatabaseCount('bale_outbox', 0);
        $this->assertDatabaseCount('domain_records', 0);
        $this->assertCount(0, $this->sent);
    }

    public function test_preferences_preserve_internal_notifications_and_cancel_pending_delivery(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        Sanctum::actingAs($user);
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson('/api/v1/notifications', $this->notification($user))->assertCreated();
        $lock->release();
        $this->putJson('/api/v1/bale/account/preferences', ['notifications_enabled' => false])->assertOk();
        $this->getJson('/api/v1/bale/account')->assertJsonPath('data.notifications_enabled', false);
        $this->postJson('/api/v1/notifications', $this->notification($user))->assertCreated();
        app(NotificationDelivery::class)->sendNow();
        $this->assertDatabaseCount('domain_records', 2);
        $this->assertDatabaseCount('bale_outbox', 1);
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_notification_pending_delivery_rechecks_task_ownership(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        $task = $this->task($user);
        Sanctum::actingAs($user);
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson('/api/v1/notifications', $this->notification($user, ['linkTaskId' => $task->id]))->assertCreated();
        $lock->release();
        $task->update(['assignee_id' => $this->user()->id]);
        app(NotificationDelivery::class)->sendNow();
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_manual_reminder_button_is_owner_only_and_repeated_request_does_not_duplicate(): void
    {
        $this->ready();
        $owner = $this->user();
        $this->grant($owner, ['meetings.view', 'meetings.edit']);
        $this->link($owner);
        $meeting = $this->meeting($owner);
        Sanctum::actingAs($owner);
        $preview = $this->getJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder')->assertOk()->json('data');
        $data = ['version' => $preview['version'], 'request_id' => (string) Str::uuid(), 'confirm' => true];
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', $data)->assertOk()->assertJsonPath('data.counts.sent', 1);
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', $data)->assertOk()->assertJsonPath('data.counts.sent', 1);
        $this->assertDatabaseCount('bale_reminder_runs', 1);
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertCount(1, $this->sent);
        $other = $this->user();
        $this->grant($other, ['meetings.view', 'meetings.edit']);
        Sanctum::actingAs($other);
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', $data)->assertForbidden();
    }

    public function test_manual_reminders_are_bounded_and_continue_without_new_notifications(): void
    {
        $this->ready();
        $owner = $this->user();
        $this->grant($owner, ['meetings.view', 'meetings.edit']);
        $this->link($owner);
        $attendees = [];
        for ($i = 0; $i < 11; $i++) {
            $u = $this->user();
            $this->grant($u, ['meetings.view']);
            $this->link($u, (string) (1000 + $i));
            $attendees[] = (string) $u->id;
        }
        $meeting = $this->meeting($owner, $attendees);
        Sanctum::actingAs($owner);
        $result = $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', ['request_id' => (string) Str::uuid(), 'version' => MeetingReminders::snapshot($meeting), 'confirm' => true])->assertOk()->assertJsonPath('data.counts.sent', 10)->assertJsonPath('data.counts.pending', 2)->json('data');
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder/'.$result['run_id'].'/deliver')->assertOk()->assertJsonPath('data.counts.sent', 12);
        $this->assertDatabaseCount('domain_records', 12);
        $this->assertNotContains('getUpdates', $this->methods);
    }

    public function test_reschedule_invalidates_preview_and_pending_reminders(): void
    {
        $this->ready();
        $owner = $this->user();
        $this->grant($owner, ['meetings.view', 'meetings.edit']);
        $this->link($owner);
        $meeting = $this->meeting($owner);
        Sanctum::actingAs($owner);
        $version = MeetingReminders::snapshot($meeting);
        $key = (string) Str::uuid();
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', ['request_id' => $key, 'version' => $version, 'confirm' => true])->assertOk();
        $lock->release();
        $meeting->update(['payload' => [...$meeting->payload, 'time' => '12:00']]);
        app(NotificationDelivery::class)->sendNow();
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', ['request_id' => (string) Str::uuid(), 'version' => $version, 'confirm' => true])->assertConflict();
    }

    public function test_task_edit_requires_permission_preview_confirmation_and_is_replay_safe(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'tasks.edit']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'editfield:'.$task->id.':title')]);
        $this->tick([$this->message(2, 'عنوان جدید')]);
        $this->assertNotSame('عنوان جدید', $task->fresh()->title);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce), $this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertSame('عنوان جدید', $task->fresh()->title);
        $this->assertDatabaseCount('activity_logs', 1);
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_task_edit_conflict_and_content_workflow_fail_closed(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'tasks.edit']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'editfield:'.$task->id.':title'), $this->message(2, 'old draft')]);
        $nonce = BaleConversation::first()->nonce;
        $task->update(['title' => 'new panel title']);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame('new panel title', $task->fresh()->title);
        $task->update(['kind' => 'content_review']);
        $this->tick([$this->buttonUpdate(4, 'editfield:'.$task->id.':title')]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_task_edit_rechecks_revoked_permission_at_confirmation(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'tasks.edit']);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'editfield:'.$task->id.':title'), $this->message(2, 'not allowed')]);
        $nonce = BaleConversation::first()->nonce;
        $this->grant($user, ['tasks.view']);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame('My private task', $task->fresh()->title);
        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_asset_form_saves_only_after_confirmation_and_duplicate_click_is_safe(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->asset($user);
        $this->tick([$this->buttonUpdate(1, 'departmentform:'.$department->id.':'.$table->id), $this->message(2, 'دوربین')]);
        $this->assertDatabaseCount('dam_data_rows', 0);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce), $this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_data_rows', 1);
        $this->assertDatabaseCount('dam_data_row_activities', 1);
        $this->assertSame('دوربین', $table->rows()->first()->cells['name']);
        $this->assertSame('bale', $table->rows()->first()->activities()->first()->metadata['source']);
        foreach ($this->sent as $message) {
            $this->assertArrayNotHasKey('_department_id', $message);
            $this->assertArrayNotHasKey('_subject_ids', $message);
        }
    }

    public function test_asset_schema_change_and_membership_removal_cannot_commit_old_forms(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->asset($user);
        $this->tick([$this->buttonUpdate(1, 'departmentform:'.$department->id.':'.$table->id), $this->message(2, 'draft')]);
        $nonce = BaleConversation::first()->nonce;
        $table->update(['columns' => [['id' => 'other', 'name' => 'Changed', 'type' => 'number']]]);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_data_rows', 0);
        $this->tick([$this->buttonUpdate(4, 'departmentform:'.$department->id.':'.$table->id), $this->message(5, '42')]);
        $nonce = BaleConversation::first()->nonce;
        $department->members()->detach($user);
        $this->tick([$this->buttonUpdate(6, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_data_rows', 0);
    }

    public function test_unmapped_tables_are_panel_only_and_guessing_another_department_is_denied(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->asset($user);
        $table->departments()->detach();
        $this->assertTrue(app(DamTableAccess::class)->canEdit($user, $table));
        $this->tick([$this->buttonUpdate(1, 'departmentform:'.$department->id.':'.$table->id)]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $other = Department::create(['name' => 'Other', 'status' => 'active']);
        $table->departments()->attach($other);
        $this->assertFalse(app(DamTableAccess::class)->canView($user, $table));
        $this->tick([$this->buttonUpdate(2, 'departmentform:'.$other->id.':'.$table->id)]);
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_asset_validation_rejects_number_date_select_and_unknown_fields_in_panel_and_bot(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->asset($user, [
            ['id' => 'count', 'name' => 'تعداد', 'type' => 'number', 'required' => true],
            ['id' => 'day', 'name' => 'تاریخ', 'type' => 'date'], ['id' => 'state', 'name' => 'حالت', 'type' => 'select', 'options' => ['new', 'used']],
        ]);
        Sanctum::actingAs($user);
        foreach ([['count' => 'abc'], ['count' => 1, 'day' => '2026-02-31'], ['count' => 1, 'state' => 'bad'], ['count' => 1, 'extra' => 'bad']] as $cells) {
            $this->postJson('/api/v1/dam/data-tables/'.$table->id.'/rows', ['cells' => $cells])->assertUnprocessable();
        }
        $this->tick([$this->buttonUpdate(1, 'departmentform:'.$department->id.':'.$table->id), $this->message(2, 'abc')]);
        $this->assertSame(0, BaleConversation::first()->data['index']);
        $this->assertDatabaseCount('dam_data_rows', 0);
    }

    public function test_only_access_manager_can_map_departments_and_mapping_is_audited(): void
    {
        $user = $this->user();
        [$department, $table] = $this->asset($user);
        Sanctum::actingAs($user);
        $this->putJson('/api/v1/bale/asset-tables/'.$table->id.'/departments', ['department_ids' => []])->assertForbidden();
        $this->grant($user, ['assets.manage_access']);
        Sanctum::actingAs($user->fresh());
        $this->putJson('/api/v1/bale/asset-tables/'.$table->id.'/departments', ['department_ids' => []])->assertOk();
        $this->assertDatabaseCount('dam_data_table_department', 0);
        $this->assertDatabaseHas('activity_logs', ['type' => 'dam_table_departments_changed']);
    }

    public function test_meeting_creation_uses_real_duration_text_and_cannot_impersonate_organizer(): void
    {
        $user = $this->user();
        $this->grant($user, ['meetings.view', 'meetings.create']);
        Sanctum::actingAs($user);
        $data = ['title' => 'جلسه', 'organizerId' => (string) $user->id, 'attendeeIds' => [], 'duration' => '۹۰ دقیقه', 'status' => 'scheduled'];
        $this->postJson('/api/v1/think-tank-meetings', $data)->assertCreated();
        $this->postJson('/api/v1/think-tank-meetings', [...$data, 'organizerId' => $this->user()->id])->assertForbidden();
    }

    public function test_cancelled_meeting_and_removed_attendee_cancel_pending_messages(): void
    {
        $this->ready();
        $owner = $this->user();
        $this->grant($owner, ['meetings.view', 'meetings.edit']);
        $this->link($owner);
        $guest = $this->user();
        $this->grant($guest, ['meetings.view']);
        $this->link($guest, '555');
        $meeting = $this->meeting($owner, [(string) $guest->id]);
        Sanctum::actingAs($owner);
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson('/api/v1/bale/meetings/'.$meeting->id.'/reminder', ['request_id' => (string) Str::uuid(), 'version' => MeetingReminders::snapshot($meeting), 'confirm' => true])->assertOk();
        $lock->release();
        $meeting->update(['status' => 'cancelled', 'payload' => [...$meeting->payload, 'attendeeIds' => []]]);
        app(NotificationDelivery::class)->sendNow();
        $this->assertSame(2, BaleOutbox::where('status', 'cancelled')->count());
        $this->assertCount(0, $this->sent);
    }

    public function test_asset_cancel_and_expiry_never_write_a_row(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->asset($user);
        $this->tick([$this->buttonUpdate(1, 'departmentform:'.$department->id.':'.$table->id), $this->message(2, 'draft')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'cancel'), $this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_data_rows', 0);
        $this->tick([$this->buttonUpdate(5, 'departmentform:'.$department->id.':'.$table->id), $this->message(6, 'draft')]);
        $nonce = BaleConversation::first()->nonce;
        $this->travel(16)->minutes();
        $this->tick([$this->buttonUpdate(7, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_data_rows', 0);
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_pending_asset_preview_is_cancelled_when_department_is_archived(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        [$department, $table] = $this->asset($user);
        app(Outbox::class)->enqueue('asset-preview', '991', ['text' => 'secret', '_department_id' => $department->id], $link, 'asset_table', $table->id);
        $department->update(['status' => 'inactive']);
        app(NotificationDelivery::class)->sendNow();
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_new_migration_rolls_back_and_reapplies_without_touching_domain_data(): void
    {
        $user = $this->user();
        $task = $this->task($user);
        $migration = require database_path('migrations/2026_09_28_110000_extend_bale_operations.php');
        $migration->down();
        $this->assertFalse(Schema::hasTable('bale_reminder_runs'));
        $this->assertFalse(Schema::hasColumn('bale_user_links', 'notifications_enabled'));
        $migration->up();
        $this->assertTrue(Schema::hasTable('dam_data_table_team'));
        $this->assertSame($task->title, $task->fresh()->title);
    }

    public function test_revoking_notification_creator_permission_cancels_pending_external_message(): void
    {
        $this->ready();
        $actor = $this->user();
        $recipient = $this->user();
        $this->grant($actor, ['tasks.view', 'tasks.assign']);
        $this->link($recipient);
        $task = $this->task($recipient);
        Sanctum::actingAs($actor);
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson('/api/v1/notifications', $this->notification($recipient, ['linkTaskId' => $task->id, 'type' => 'assignment']))->assertCreated();
        $lock->release();
        $this->grant($actor, ['tasks.view']);
        app(NotificationDelivery::class)->sendNow();
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_deleting_internal_notification_does_not_allow_same_request_to_resend(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        Sanctum::actingAs($user);
        $data = $this->notification($user);
        $id = $this->postJson('/api/v1/notifications', $data)->assertCreated()->json('data.id');
        $this->deleteJson('/api/v1/notifications/'.$id)->assertNoContent();
        $this->postJson('/api/v1/notifications', $data)->assertCreated();
        $this->assertCount(1, $this->sent);
        $this->assertDatabaseCount('bale_outbox', 1);
    }

    public function test_persisted_content_letter_and_resolution_notifications_use_canonical_recipients(): void
    {
        $this->ready();
        $actor = $this->user();
        $recipient = $this->user();
        $outsider = $this->user();
        $this->grant($actor, ['content.view', 'content.edit', 'secretariat.view', 'secretariat.refer_letter', 'secretariat.manage_resolutions']);
        $this->grant($recipient, ['content.view', 'secretariat.view']);
        $this->grant($outsider, ['content.view', 'secretariat.view']);
        $this->link($recipient);
        Sanctum::actingAs($actor);
        $content = Content::create(['title' => 'Content', 'type' => 'article', 'status' => 'idea', 'owner_id' => $actor->id, 'payload' => ['stages' => [['id' => 'stage-a', 'assigneeId' => (string) $recipient->id]]]]);
        $letter = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_LETTER, 'title' => 'Letter', 'owner_id' => $actor->id, 'payload' => ['referrals' => [['toUserId' => (string) $recipient->id]]]]);
        $resolution = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_RESOLUTION, 'title' => 'Resolution', 'owner_id' => $recipient->id, 'payload' => ['responsibleUserId' => (string) $recipient->id]]);
        foreach (['linkContentId' => $content->id, 'linkLetterId' => $letter->id, 'linkResolutionId' => $resolution->id] as $key => $id) {
            $this->postJson('/api/v1/notifications', $this->notification($recipient, [$key => $id, 'type' => 'assignment']))->assertCreated();
            $this->postJson('/api/v1/notifications', $this->notification($outsider, [$key => $id, 'type' => 'assignment']))->assertForbidden();
        }
        $this->assertCount(3, $this->sent);
        $this->assertDatabaseCount('domain_records', 3);
    }
}
