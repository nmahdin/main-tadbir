<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Client\BaleHttp;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Events\RequestSending;
use Illuminate\Http\Client\Events\ResponseReceived;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BaleIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz123456';

    private array $updates = [];

    private array $methods = [];

    private array $sent = [];

    private ?string $failure = null;

    protected function setUp(): void
    {
        $this->mockConsoleOutput = false;
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32)), 'bale.panel_url' => 'https://tadbir.example', 'bale.runner_secret' => null]);
        $http = app(BaleHttp::class);
        $http->preventStrayRequests();
        $http->fake(function ($request) use ($http) {
            $method = basename(parse_url($request->url(), PHP_URL_PATH));
            $this->methods[] = $method;
            if ($method === 'sendMessage') {
                $this->sent[] = $request->data();
                if ($this->failure === 'timeout') {
                    throw new ConnectionException('secret URL '.self::TOKEN);
                }
                if ($this->failure === '429') {
                    return $http->response(['ok' => false, 'error_code' => 429, 'description' => self::TOKEN, 'parameters' => ['retry_after' => 120]], 429);
                }
                if ($this->failure === '403') {
                    return $http->response(['ok' => false, 'error_code' => 403, 'description' => self::TOKEN], 403);
                }
            }
            if ($this->failure === 'unauthorized' && $method === 'getMe') {
                return $http->response(['ok' => false, 'error_code' => 401, 'description' => self::TOKEN], 401);
            }

            return $http->response(['ok' => true, 'result' => match ($method) {
                'getMe' => ['id' => 123456, 'username' => 'tadbir_test_bot'],
                'getWebhookInfo' => ['url' => ''],
                'getUpdates' => $this->updates,
                'sendMessage' => ['message_id' => 50],
                'deleteWebhook', 'answerCallbackQuery' => true,
                default => throw new \RuntimeException('Unexpected API method'),
            }]);
        });
    }

    private function user(bool $admin = false): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $role = Role::firstOrCreate(['key' => $admin ? 'bot_admin' : 'bot_member'], ['name' => 'Bot test role']);
        foreach (['tasks.view', 'projects.view', ...($admin ? ['settings.manage'] : [])] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->update(['role_id' => $role->id]);

        return $user;
    }

    private function ready(): void
    {
        app(Settings::class)->write([
            'enabled' => true, 'token' => Crypt::encryptString(self::TOKEN), 'bot_id' => '123456',
            'connection_status' => 'connected', 'offset' => 0,
        ]);
    }

    private function link(User $user, string $sender = '991'): BaleUserLink
    {
        return BaleUserLink::create(['user_id' => $user->id, 'bale_user_id' => $sender, 'chat_id' => $sender]);
    }

    private function task(User $user, string $title = 'My private task'): Task
    {
        return Task::create(['title' => $title, 'assignee_id' => $user->id, 'status' => 'todo', 'priority' => 'medium', 'kind' => 'general']);
    }

    private function message(int $id, string $text, string $sender = '991', string $type = 'private'): array
    {
        return ['update_id' => $id, 'message' => ['from' => ['id' => $sender], 'chat' => ['id' => $sender, 'type' => $type], 'text' => $text]];
    }

    private function buttonUpdate(int $id, string $data, string $sender = '991'): array
    {
        return ['update_id' => $id, 'callback_query' => ['id' => 'cb'.$id, 'from' => ['id' => $sender], 'data' => $data, 'message' => ['chat' => ['id' => $sender, 'type' => 'private']]]];
    }

    private function tick(array $updates): void
    {
        $this->updates = $updates;
        app(RuntimeLock::class)->run(fn () => app(PollingRunner::class)->tick());
    }

    public function test_settings_require_sensitive_permission_and_active_account(): void
    {
        $this->getJson('/api/v1/bale/settings')->assertUnauthorized();
        Sanctum::actingAs($this->user());
        $this->getJson('/api/v1/bale/settings')->assertForbidden();
        $admin = $this->user(true);
        $admin->update(['status' => 'blocked']);
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/bale/settings/test')->assertForbidden();
        $this->assertSame([], $this->methods);
    }

    public function test_token_is_encrypted_excluded_from_general_settings_and_never_returned(): void
    {
        Sanctum::actingAs($this->user(true));
        $response = $this->putJson('/api/v1/bale/settings', ['enabled' => true, 'token' => self::TOKEN]);
        $response->assertOk()->assertJsonPath('data.has_token', true)->assertJsonPath('data.connection_status', 'untested');
        $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
        $stored = DB::table('system_settings')->where('key', Settings::KEY)->value('value');
        $this->assertStringNotContainsString(self::TOKEN, $stored);
        $this->assertSame(self::TOKEN, app(Settings::class)->token());
        $this->getJson('/api/v1/settings')->assertOk()->assertJsonMissingPath('data.bale_private');
        $this->getJson('/api/v1/settings/bale_private')->assertNotFound();
        $this->postJson('/api/v1/bale/settings/test')->assertOk()->assertJsonPath('data.connection_status', 'connected');
        $this->assertSame(['getMe', 'getWebhookInfo'], $this->methods);
        $this->assertDatabaseHas('activity_logs', ['type' => 'bale_token_changed']);
    }

    public function test_invalid_token_and_remote_error_do_not_leak_credentials(): void
    {
        Sanctum::actingAs($this->user(true));
        $this->putJson('/api/v1/bale/settings', ['enabled' => true, 'token' => 'bad'])->assertUnprocessable();
        $this->ready();
        $this->failure = 'unauthorized';
        $response = $this->postJson('/api/v1/bale/settings/test')->assertUnprocessable()->assertJsonPath('error_code', 'unauthorized');
        $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
        $this->assertSame('failed', app(Settings::class)->read()['connection_status']);
    }

    public function test_public_webhook_is_fail_closed_and_runner_cannot_ingest_caller_payload(): void
    {
        $this->ready();
        $this->postJson('/api/v1/bot/bale/webhook', $this->message(1, 'FAKECODE12'))->assertStatus(503);
        $this->postJson('/api/v1/bot/bale/tick')->assertForbidden();
        config(['bale.runner_secret' => str_repeat('r', 40)]);
        $this->postJson('/api/v1/bot/bale/tick?secret='.str_repeat('r', 40))->assertForbidden();
        $this->withHeader('Authorization', 'Bearer '.str_repeat('r', 40))
            ->postJson('/api/v1/bot/bale/tick', $this->message(2, 'ignored'))->assertOk();
        $this->assertDatabaseCount('bale_inbox', 0);
        $this->assertNotNull(app(Settings::class)->read()['last_external_tick_at']);
    }

    public function test_code_is_short_lived_hashed_single_use_and_bound_to_one_account(): void
    {
        $this->ready();
        $user = $this->user();
        Sanctum::actingAs($user);
        $code = $this->postJson('/api/v1/bale/account/code')->assertOk()->json('data.code');
        $this->assertStringNotContainsString($code, json_encode(DB::table('bale_link_codes')->first()));
        $this->tick([$this->message(1, $code)]);
        $this->assertDatabaseHas('bale_user_links', ['user_id' => $user->id, 'bale_user_id' => '991']);
        $this->assertDatabaseCount('bale_link_codes', 0);
        $this->tick([$this->message(2, $code, '992')]);
        $this->assertDatabaseCount('bale_user_links', 1);
        $this->postJson('/api/v1/bale/account/code')->assertStatus(409);
        $this->deleteJson('/api/v1/bale/account', ['confirm' => true])->assertOk()->assertJsonPath('data.connected', false);
        $newCode = $this->postJson('/api/v1/bale/account/code')->assertOk()->json('data.code');
        $this->travel(6)->minutes();
        $this->tick([$this->message(3, $newCode)]);
        $this->assertDatabaseCount('bale_user_links', 0);
    }

    public function test_link_attempt_limit_and_group_messages(): void
    {
        $this->ready();
        $user = $this->user();
        $linker = app(AccountLinker::class);
        $code = $linker->issue($user)['code'];
        $this->tick([$this->message(1, $code, '991', 'group')]);
        $this->assertDatabaseCount('bale_user_links', 0);
        for ($i = 0; $i < 5; $i++) {
            $linker->consume('0000000000', '991', '991');
        }
        $this->assertNull($linker->consume($code, '991', '991'));
        $this->assertNotNull($linker->consume($code, '992', '992'));
    }

    public function test_existing_bale_identity_cannot_take_another_account_code(): void
    {
        $this->ready();
        $first = $this->user();
        $second = $this->user();
        $this->link($first);
        $code = app(AccountLinker::class)->issue($second)['code'];
        $this->assertNull(app(AccountLinker::class)->consume($code, '991', '991'));
        $this->assertDatabaseHas('bale_user_links', ['user_id' => $first->id, 'bale_user_id' => '991']);
    }

    public function test_report_preview_confirmation_and_duplicate_updates_are_atomic(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'report:'.$task->id)]);
        $this->tick([$this->message(2, 'گزارش آزمایشی')]);
        $session = BaleConversation::where('link_id', $link->id)->firstOrFail();
        $this->assertSame('report_confirm', $session->step);
        $this->assertDatabaseCount('task_comments', 0);
        $this->assertStringNotContainsString('گزارش آزمایشی', DB::table('bale_conversations')->value('data'));
        $confirm = $this->buttonUpdate(3, 'confirm:'.$session->nonce);
        $this->tick([$confirm]);
        // Even a restored/reset polling cursor cannot replay a committed operation.
        app(Settings::class)->write(['offset' => 0]);
        $this->tick([$confirm, $this->buttonUpdate(4, 'confirm:'.$session->nonce)]);
        $this->assertDatabaseCount('task_comments', 1);
        $this->assertDatabaseHas('task_comments', ['task_id' => $task->id, 'user_id' => $user->id, 'text' => 'گزارش آزمایشی']);
        $this->assertSame(1, DB::table('activity_logs')->where('type', 'comment')->count());
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_forged_task_callback_and_revoked_assignment_are_denied(): void
    {
        $this->ready();
        $actor = $this->user();
        $other = $this->user();
        $link = $this->link($actor);
        $task = $this->task($other, 'NEVER_DISCLOSE');
        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $this->assertStringNotContainsString('NEVER_DISCLOSE', json_encode($this->sent));
        $task->update(['assignee_id' => $actor->id]);
        $this->tick([$this->buttonUpdate(2, 'report:'.$task->id)]);
        $this->tick([$this->message(3, 'draft')]);
        $nonce = BaleConversation::where('link_id', $link->id)->value('nonce');
        $task->update(['assignee_id' => $other->id]);
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('task_comments', 0);
    }

    public function test_stale_status_confirmation_does_not_overwrite_panel_change(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'status:'.$task->id)]);
        $nonce = BaleConversation::where('link_id', $link->id)->value('nonce');
        $this->tick([$this->buttonUpdate(2, 'choose:'.$nonce.':completed')]);
        $task->update(['status' => 'review']);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame('review', $task->fresh()->status);
        $this->assertSame(0, DB::table('activity_logs')->where('type', 'status_change')->count());
    }

    public function test_status_change_is_shared_with_panel_and_audited_only_once(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'status:'.$task->id)]);
        $nonce = BaleConversation::where('link_id', $link->id)->value('nonce');
        $this->tick([$this->buttonUpdate(2, 'choose:'.$nonce.':completed')]);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce), $this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertSame('completed', $task->fresh()->status);
        Sanctum::actingAs($user);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'completed'])->assertOk();
        $this->assertSame(1, DB::table('activity_logs')->where('type', 'status_change')->count());
    }

    public function test_expired_confirmation_and_inactive_user_cannot_mutate_tasks(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'report:'.$task->id)]);
        $this->tick([$this->message(2, 'draft')]);
        $nonce = BaleConversation::where('link_id', $link->id)->value('nonce');
        $this->travel(16)->minutes();
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('task_comments', 0);
        $user->update(['status' => 'blocked']);
        $before = count($this->sent);
        $this->tick([$this->buttonUpdate(4, 'report:'.$task->id)]);
        $this->assertCount($before, $this->sent);
    }

    public function test_ambiguous_send_is_not_retried_and_does_not_leak_token(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        $this->failure = 'timeout';
        $this->tick([$this->message(1, '/start')]);
        $this->assertDatabaseHas('bale_outbox', ['status' => 'unknown', 'error_code' => 'transport_unknown', 'attempts' => 1]);
        $this->tick([]);
        $this->assertCount(1, $this->sent);
        $this->assertStringNotContainsString(self::TOKEN, json_encode(app(Settings::class)->publicState()));
    }

    public function test_rate_limit_backoff_and_permanent_errors_are_distinguished(): void
    {
        $this->ready();
        $this->link($this->user());
        $this->failure = '429';
        $this->tick([$this->message(1, '/start')]);
        $this->assertDatabaseHas('bale_outbox', ['status' => 'pending', 'attempts' => 1]);
        $this->tick([]);
        $this->assertCount(1, $this->sent);
        $this->travel(121)->seconds();
        $this->failure = '403';
        $this->tick([]);
        $this->assertDatabaseHas('bale_outbox', ['status' => 'failed', 'error_code' => 'forbidden', 'attempts' => 2]);
    }

    public function test_disconnecting_cancels_pending_delivery_and_token_replacement_is_guarded(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        app(Outbox::class)->enqueue('queued', '991', ['text' => 'private'], $link);
        Sanctum::actingAs($this->user(true));
        $this->putJson('/api/v1/bale/settings', ['enabled' => true, 'token' => self::TOKEN])->assertUnprocessable();
        Sanctum::actingAs($user);
        $this->deleteJson('/api/v1/bale/account', ['confirm' => true])->assertOk();
        $this->tick([]);
        $this->assertDatabaseHas('bale_outbox', ['deduplication_key' => 'queued', 'status' => 'cancelled']);
        $this->assertCount(0, $this->sent);
    }

    public function test_membership_is_rechecked_before_sending_project_details(): void
    {
        $this->ready();
        $actor = $this->user();
        $other = $this->user();
        $link = $this->link($actor);
        $project = Project::create(['name' => 'Secret', 'key' => 'SEC', 'project_manager_id' => $other->id]);
        $project->members()->attach($actor);
        app(Outbox::class)->enqueue('project', '991', ['text' => 'Secret'], $link, 'project', $project->id);
        $project->members()->detach($actor);
        $this->tick([]);
        $this->assertDatabaseHas('bale_outbox', ['deduplication_key' => 'project', 'status' => 'cancelled']);
        $this->assertCount(0, $this->sent);
    }

    public function test_existing_webhook_conflict_and_manual_processing_do_not_claim_scheduler_health(): void
    {
        $this->ready();
        app(Settings::class)->write(['remote_webhook_present' => true]);
        Sanctum::actingAs($this->user(true));
        $this->postJson('/api/v1/bale/process')->assertUnprocessable()->assertJsonPath('error_code', 'webhook_conflict');
        $this->postJson('/api/v1/bale/settings/polling', ['confirm' => true])->assertOk();
        $this->postJson('/api/v1/bale/process')->assertOk()->assertJsonPath('data.runner_recent', false);
        $this->assertSame(['deleteWebhook', 'getUpdates'], $this->methods);
    }

    public function test_local_disconnect_does_not_call_remote_api_and_clears_accounts(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        Sanctum::actingAs($this->user(true));
        $this->deleteJson('/api/v1/bale/settings', ['local_only' => true])->assertUnprocessable();
        $this->deleteJson('/api/v1/bale/settings', ['confirm' => true, 'local_only' => true])->assertOk()->assertJsonPath('data.has_token', false);
        $this->assertDatabaseCount('bale_user_links', 0);
        $this->assertSame([], $this->methods);
        $this->assertDatabaseHas('activity_logs', ['type' => 'bale_disconnected_local_only']);
    }

    public function test_runtime_lock_blocks_concurrent_configuration_and_processing(): void
    {
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $lock = Cache::lock('bale:runtime', 90);
        $this->assertTrue($lock->get());
        try {
            $this->postJson('/api/v1/bale/process')->assertStatus(409);
            $this->putJson('/api/v1/bale/settings', ['enabled' => false])->assertStatus(409);
            $this->assertTrue(app(Settings::class)->ready());
        } finally {
            $lock->release();
        }
        $this->assertSame([], $this->methods);
    }

    public function test_forged_chat_context_and_other_user_confirmation_do_not_register_reports(): void
    {
        $this->ready();
        $owner = $this->user();
        $other = $this->user();
        $link = $this->link($owner);
        $this->link($other, '992');
        $task = $this->task($owner);
        $this->tick([$this->buttonUpdate(1, 'report:'.$task->id)]);
        $this->tick([$this->message(2, 'draft')]);
        $nonce = BaleConversation::where('link_id', $link->id)->value('nonce');
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce, '992')]);
        $forged = $this->buttonUpdate(4, 'confirm:'.$nonce);
        $forged['callback_query']['message']['chat']['id'] = '992';
        $this->tick([$forged]);
        $this->assertDatabaseCount('task_comments', 0);
        $this->tick([$this->buttonUpdate(5, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('task_comments', 1);
    }

    public function test_private_http_client_emits_no_secret_bearing_framework_events(): void
    {
        Event::fake([
            RequestSending::class,
            ResponseReceived::class,
        ]);
        $this->ready();
        app(Settings::class)->test(app(BaleClient::class));
        Event::assertNotDispatched(RequestSending::class);
        Event::assertNotDispatched(ResponseReceived::class);
    }

    public function test_content_tasks_cannot_bypass_the_content_workflow_in_bale(): void
    {
        $this->ready();
        $actor = $this->user();
        $this->link($actor);
        $task = $this->task($actor);
        $task->update(['kind' => 'content_review']);
        $this->tick([$this->buttonUpdate(1, 'status:'.$task->id)]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertSame('todo', $task->fresh()->status);
    }

    public function test_disabling_bot_cancels_pending_messages_and_stops_processing(): void
    {
        $this->ready();
        $link = $this->link($this->user());
        app(Outbox::class)->enqueue('pending', '991', ['text' => 'private'], $link);
        Sanctum::actingAs($this->user(true));
        $this->putJson('/api/v1/bale/settings', ['enabled' => false])->assertOk();
        $this->postJson('/api/v1/bale/process')->assertUnprocessable();
        $this->assertDatabaseHas('bale_outbox', ['deduplication_key' => 'pending', 'status' => 'cancelled']);
        $this->assertSame([], $this->methods);
    }

    public function test_revoked_role_permission_blocks_view_and_pending_delivery(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $task = $this->task($user, 'DO_NOT_DISCLOSE');
        app(Outbox::class)->enqueue('revoked-role', '991', ['text' => 'DO_NOT_DISCLOSE'], $link, 'task', $task->id);
        $user->role->permissions()->detach();
        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $this->assertStringNotContainsString('DO_NOT_DISCLOSE', json_encode($this->sent));
        $this->assertDatabaseHas('bale_outbox', ['deduplication_key' => 'revoked-role', 'status' => 'cancelled']);
    }
}
