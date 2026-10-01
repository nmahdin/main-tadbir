<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Support\PersianDate;
use App\Models\BaleConversation;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\MeetingActionTasks;
use App\Services\MeetingNotifications;
use App\Services\TaskAssignmentNotifications;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BaleTaskMeetingFixesTest extends TestCase
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
        $role = Role::create(['key' => 'fix_'.Str::random(8), 'name' => 'Fix test']);
        foreach ($keys as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'test']));
        }
        $user->update(['role_id' => $role->id]);
        $user->unsetRelation('role');
    }

    public function test_repeated_status_choice_redisplays_confirmation_without_generic_error_or_duplicate_write(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'status:'.$task->id)]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(2, 'choose:'.$nonce.':in_progress'), $this->buttonUpdate(3, 'choose:'.$nonce.':in_progress')]);
        $this->assertStringContainsString('تأیید', end($this->sent)['text']);
        $this->assertStringNotContainsString('در دسترس نیست', end($this->sent)['text']);
        $this->assertSame('backlog', $task->fresh()->status);
        $this->tick([$this->buttonUpdate(4, 'choose:'.$nonce.':completed')]);
        $this->assertStringContainsString('S03', end($this->sent)['text']);
        $this->tick([$this->buttonUpdate(5, 'confirm:'.$nonce), $this->buttonUpdate(6, 'confirm:'.$nonce)]);
        $this->assertSame('in_progress', $task->fresh()->status);
        $this->assertDatabaseCount('activity_logs', 1);
        $this->tick([$this->buttonUpdate(7, 'task:'.$task->id)]);
        $this->assertStringNotContainsString('report:', json_encode(end($this->sent)['reply_markup']));
    }

    public function test_new_task_api_creates_assignment_from_persisted_id_without_client_notification_call(): void
    {
        $this->ready();
        $creator = $this->user();
        $recipient = $this->user();
        $this->link($recipient);
        $this->grant($creator, ['tasks.create', 'tasks.view']);
        Sanctum::actingAs($creator);
        $response = $this->postJson('/api/v1/tasks', ['title' => 'واگذاری سرور', 'assigneeId' => $recipient->id, 'deadline' => '2026-09-28'])->assertCreated();
        $taskId = $response->json('data.id');
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertSame($taskId, DomainRecord::first()->payload['linkTaskId']);
        $this->assertCount(1, $this->sent);
        $this->assertStringContainsString('۱۴۰۵/۰۷/۰۶', $this->sent[0]['text']);
        app(TaskAssignmentNotifications::class)->created(Task::find($taskId));
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertCount(1, $this->sent);
    }

    private function meeting(User $owner, User $recipient, string $deadline = '۱۴۰۵/۰۷/۰۶'): WorkspaceRecord
    {
        return WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_MEETING, 'title' => 'جلسه', 'owner_id' => $owner->id, 'status' => 'completed', 'payload' => ['attendeeIds' => [(string) $recipient->id], 'actionItems' => [['id' => 'action-1', 'title' => 'اقدام واقعی', 'assigneeId' => (string) $recipient->id, 'deadline' => $deadline, 'status' => 'pending']]]]);
    }

    public function test_action_conversion_is_atomic_replay_safe_and_normalizes_legacy_persian_deadline(): void
    {
        $this->ready();
        $owner = $this->user();
        $recipient = $this->user();
        $this->link($recipient);
        $this->grant($owner, ['meetings.minutes', 'meetings.view', 'tasks.create', 'tasks.view']);
        Sanctum::actingAs($owner);
        $meeting = $this->meeting($owner, $recipient);
        $url = '/api/v1/think-tank-meetings/'.$meeting->id.'/actions/action-1/task';
        $first = $this->postJson($url, [])->assertOk();
        $this->assertSame('2026-09-28', $first->json('data.task.deadline'));
        $this->postJson($url, [])->assertOk()->assertJsonPath('data.task.id', $first->json('data.task.id'));
        $this->assertDatabaseCount('tasks', 1);
        $this->assertDatabaseCount('domain_records', 1);
        $this->assertCount(1, $this->sent);
        $this->assertSame($first->json('data.task.id'), $meeting->fresh()->payload['actionItems'][0]['convertedTaskId']);
        // A stale minutes form cannot erase/forge the server-owned conversion reference.
        $items = $meeting->payload['actionItems'];
        $items[0]['convertedTaskId'] = '999';
        $this->putJson('/api/v1/think-tank-meetings/'.$meeting->id, ['actionItems' => $items])->assertOk();
        $this->assertSame($first->json('data.task.id'), $meeting->fresh()->payload['actionItems'][0]['convertedTaskId']);
        $this->putJson('/api/v1/think-tank-meetings/'.$meeting->id, ['actionItems' => []])->assertUnprocessable();
        $this->postJson($url, [])->assertOk();
        $this->assertDatabaseCount('tasks', 1);
    }

    public function test_conversion_denies_other_owner_and_invalid_deadline_without_partial_records(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $recipient = $this->user();
        $this->grant($other, ['meetings.minutes', 'tasks.create', 'tasks.view']);
        Sanctum::actingAs($other);
        $meeting = $this->meeting($owner, $recipient, '۱۴۰۴/۱۲/۳۰');
        $url = '/api/v1/think-tank-meetings/'.$meeting->id.'/actions/action-1/task';
        $this->postJson($url, [])->assertForbidden();
        $this->grant($owner, ['meetings.minutes', 'tasks.create', 'tasks.view']);
        Sanctum::actingAs($owner);
        $this->postJson($url, [])->assertUnprocessable();
        $this->assertDatabaseCount('tasks', 0);
        $this->assertDatabaseCount('domain_records', 0);
        $this->assertSame('pending', $meeting->fresh()->payload['actionItems'][0]['status']);
    }

    public function test_meeting_creation_notifies_authorized_attendees_and_cannot_forge_converted_tasks(): void
    {
        $this->ready();
        $owner = $this->user();
        $recipient = $this->user();
        $outsider = $this->user();
        $this->grant($owner, ['meetings.create', 'meetings.view']);
        $this->grant($recipient, ['meetings.view']);
        $this->link($recipient);
        Sanctum::actingAs($owner);
        $response = $this->postJson('/api/v1/think-tank-meetings', ['title' => 'جلسه جدید', 'date' => '2026-09-28', 'time' => '10:00', 'attendeeIds' => [$recipient->id], 'actionItems' => [['id' => 'a', 'title' => 'اقدام', 'assigneeId' => $recipient->id, 'convertedTaskId' => '999']]])->assertCreated();
        $this->assertNull($response->json('data.actionItems.0.convertedTaskId'));
        $this->assertDatabaseCount('domain_records', 2);
        $this->assertCount(1, $this->sent);
        $this->assertStringContainsString('۱۴۰۵/۰۷/۰۶', $this->sent[0]['text']);
        $this->assertDatabaseMissing('domain_records', ['user_id' => $outsider->id]);
        app(MeetingNotifications::class)->created(WorkspaceRecord::find($response->json('data.id')));
        $this->assertDatabaseCount('domain_records', 2);
        $this->assertCount(1, $this->sent);
    }

    public function test_content_edit_permission_only_writes_workflow_settings_not_security_settings(): void
    {
        $user = $this->user();
        $this->grant($user, ['content.edit']);
        Sanctum::actingAs($user);
        $this->putJson('/api/v1/settings/process_templates', ['value' => []])->assertOk();
        $this->putJson('/api/v1/settings/security', ['value' => []])->assertForbidden();
    }

    public function test_notification_storage_failure_rolls_back_converted_task_and_source_marker(): void
    {
        $owner = $this->user();
        $recipient = $this->user();
        $this->grant($owner, ['meetings.minutes', 'tasks.create', 'tasks.view']);
        $meeting = $this->meeting($owner, $recipient);
        DomainRecord::creating(function ($record) {
            if ($record->domain === DomainRecord::DOMAIN_NOTIFICATION) {
                throw new \RuntimeException('notification-storage-failure');
            }
        });
        try {
            app(MeetingActionTasks::class)->convert($owner, $meeting, 'action-1', null);
            $this->fail('Expected simulated storage failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('notification-storage-failure', $e->getMessage());
        } finally {
            Event::forget('eloquent.creating: '.DomainRecord::class);
        }
        $this->assertDatabaseCount('tasks', 0);
        $this->assertDatabaseCount('domain_records', 0);
        $this->assertDatabaseCount('activity_logs', 0);
        $this->assertSame('pending', $meeting->fresh()->payload['actionItems'][0]['status']);
    }

    public function test_calendar_normalization_validates_gregorian_and_jalali_boundaries(): void
    {
        foreach (['۱۴۰۳/۱۲/۳۰' => '2025-03-20', '1404/01/01' => '2025-03-21', '١٤٠٥/٧/٦' => '2026-09-28', '2026/9/28' => '2026-09-28'] as $input => $expected) {
            $this->assertSame($expected, PersianDate::iso($input));
        }
        $this->assertNull(PersianDate::iso(''));
    }
}
