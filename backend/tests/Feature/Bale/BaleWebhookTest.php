<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Auth\AccountLinker;
use App\Bot\Bale\Settings;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BaleWebhookTest extends TestCase
{
    use BaleTestSupport, DatabaseMigrations;

    public function runDatabaseMigrations(): void
    {
        // Real commit boundary, without unrelated legacy SQLite down() failures.
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    private function activate(bool $rotate = false): string
    {
        config(['app.url' => 'https://api.tadbir.example', 'bale.webhook_base_url' => null]);
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true, 'rotate' => $rotate])
            ->assertOk()->assertJsonPath('data.transport', 'webhook')->assertJsonPath('data.remote_webhook_matches', true);

        return parse_url($this->remoteWebhook, PHP_URL_PATH);
    }

    public function test_activation_is_privileged_requires_risk_ack_and_does_not_disclose_secrets(): void
    {
        $this->ready();
        config(['app.url' => 'https://api.tadbir.example']);
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true])->assertUnauthorized();
        Sanctum::actingAs($this->user());
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true])->assertForbidden();
        Sanctum::actingAs($this->user(true));
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true])->assertUnprocessable();
        $response = $this->withHeader('Host', 'untrusted.example')->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true])->assertOk();
        $secret = Crypt::decryptString(app(Settings::class)->read()['webhook_secret']);
        $this->assertSame(64, strlen($secret));
        $this->assertSame('https://api.tadbir.example/api/v1/bot/bale/webhook/'.$secret, $this->remoteWebhook);
        $this->assertStringNotContainsString($secret, $response->getContent());
        $this->assertStringNotContainsString(self::TOKEN, $this->remoteWebhook);
        $this->assertStringNotContainsString($secret, DB::table('system_settings')->where('key', Settings::KEY)->value('value'));
        $this->assertStringNotContainsString($secret, DB::table('activity_logs')->get()->toJson());
        $this->assertSame(['url'], array_keys($this->registrations[0])); // No assumed Telegram-only parameter.
    }

    public function test_start_is_received_and_answered_without_polling_or_an_open_panel(): void
    {
        $path = $this->activate();
        $this->postJson($path, $this->message(10, '/start'))->assertOk()->assertExactJson(['ok' => true]);
        $this->assertDatabaseCount('bale_inbox', 1);
        $this->assertCount(1, $this->sent);
        $this->assertStringContainsString('اتصال', $this->sent[0]['text']);
        $this->assertSame('webhook', app(Settings::class)->publicState()['last_received_via']);
        $this->assertSame(10, app(Settings::class)->publicState()['last_update_id']);
        $this->assertNotNull(app(Settings::class)->publicState()['last_received_at']);
        $this->assertNotContains('getUpdates', $this->methods);
    }

    public function test_wrong_and_missing_secret_never_ingest_or_disclose_data(): void
    {
        $this->activate();
        $update = $this->message(1, '/start');
        $this->postJson('/api/v1/bot/bale/webhook', $update)->assertStatus(503);
        $this->postJson('/api/v1/bot/bale/webhook/'.str_repeat('0', 64), $update)->assertNotFound();
        $this->assertDatabaseCount('bale_inbox', 0);
        $this->assertCount(0, $this->sent);
        $this->assertNull(app(Settings::class)->publicState()['last_received_at']);
    }

    public function test_linking_and_report_confirmation_reuse_real_operations_once(): void
    {
        $path = $this->activate();
        $user = $this->user();
        $code = app(AccountLinker::class)->issue($user)['code'];
        $this->postJson($path, $this->message(1, $code))->assertOk();
        $this->assertDatabaseHas('bale_user_links', ['user_id' => $user->id, 'bale_user_id' => '991']);
        $task = $this->task($user);
        $this->postJson($path, $this->buttonUpdate(2, 'report:'.$task->id))->assertOk();
        $this->postJson($path, $this->message(3, 'گزارش واقعی وب‌هوک'))->assertOk();
        $nonce = BaleConversation::first()->nonce;
        $update = $this->buttonUpdate(4, 'confirm:'.$nonce);
        $this->postJson($path, $update)->assertOk();
        $sent = count($this->sent);
        $this->postJson($path, $update)->assertOk();
        $this->assertDatabaseCount('task_comments', 1);
        $this->assertDatabaseCount('bale_inbox', 4);
        $this->assertCount($sent, $this->sent);
        $this->assertContains('answerCallbackQuery', $this->methods);
        $this->assertNotContains('getUpdates', $this->methods);
    }

    public function test_authenticated_transport_does_not_grant_someone_elses_task_access(): void
    {
        $path = $this->activate();
        $this->link($this->user());
        $task = $this->task($this->user(), 'DO_NOT_DISCLOSE');
        $this->postJson($path, $this->buttonUpdate(1, 'task:'.$task->id))->assertOk();
        $this->assertStringNotContainsString('DO_NOT_DISCLOSE', json_encode($this->sent));
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_out_of_order_ids_are_not_dropped_as_if_they_were_polling_offsets(): void
    {
        $path = $this->activate();
        $this->postJson($path, $this->message(50, '/start'))->assertOk();
        $this->postJson($path, $this->message(49, '/start'))->assertOk();
        $this->assertDatabaseCount('bale_inbox', 2);
        $this->assertCount(2, $this->sent);
        $this->assertSame(0, app(Settings::class)->read()['offset']);
    }

    public function test_busy_lock_is_not_acknowledged_as_success_and_retry_can_process(): void
    {
        $path = $this->activate();
        $lock = Cache::lock('bale:runtime', 90);
        $lock->get();
        $this->postJson($path, $this->message(1, '/start'))->assertStatus(503)->assertHeader('Retry-After', '2');
        $this->assertDatabaseCount('bale_inbox', 0);
        $lock->release();
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->assertDatabaseCount('bale_inbox', 1);
    }

    public function test_malformed_and_oversized_payloads_do_not_change_inbox(): void
    {
        $path = $this->activate();
        foreach ([[], ['update_id' => -1, 'message' => []], ['update_id' => '1', 'message' => []], ['update_id' => 1], ['update_id' => 1, 'message' => [], 'callback_query' => []]] as $body) {
            $this->postJson($path, $body)->assertStatus(400);
        }
        $this->postJson($path, $this->message(1, str_repeat('x', 66000)))->assertStatus(413);
        $this->call('POST', $path, [], [], [], ['CONTENT_TYPE' => 'application/json'], '{broken')->assertStatus(400);
        $this->post($path, ['update_id' => 1])->assertStatus(415);
        $this->assertDatabaseCount('bale_inbox', 0);
        $this->assertCount(0, $this->sent);
    }

    public function test_unknown_outbound_result_cannot_reexecute_domain_change_or_resend(): void
    {
        $path = $this->activate();
        $this->failure = 'timeout';
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->assertSame('unknown', BaleOutbox::first()->status);
        $this->failure = null;
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->assertCount(1, $this->sent);
        $this->assertDatabaseCount('bale_inbox', 1);
    }

    public function test_atomic_processing_failure_is_sanitized_and_not_recorded_as_processed(): void
    {
        $path = $this->activate();
        DB::listen(function ($query) {
            if (str_contains($query->sql, 'insert into "bale_inbox"')) {
                throw new \RuntimeException('sensitive linking code');
            }
        });
        $response = $this->postJson($path, $this->message(1, '/start'))->assertStatus(503);
        $this->assertStringNotContainsString('sensitive', $response->getContent());
        $this->assertDatabaseCount('bale_inbox', 0);
        $this->assertDatabaseCount('bale_outbox', 0);
        $this->assertCount(0, $this->sent);
    }

    public function test_ambiguous_registration_can_be_retried_with_same_secret(): void
    {
        config(['app.url' => 'https://api.tadbir.example']);
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $data = ['confirm' => true, 'acknowledge_secret_url' => true];
        $this->failure = 'registration_unknown';
        $this->postJson('/api/v1/bale/settings/webhook', $data)->assertUnprocessable()->assertJsonPath('data.webhook_status', 'unconfirmed');
        $path = parse_url($this->remoteWebhook, PHP_URL_PATH);
        $this->failure = null;
        // Remote may already have applied registration even though its response timed out.
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->postJson('/api/v1/bale/settings/webhook', $data)->assertOk();
        $this->assertSame($path, parse_url($this->remoteWebhook, PHP_URL_PATH));
    }

    public function test_rotation_disable_and_polling_invalidate_old_route(): void
    {
        $old = $this->activate();
        $new = $this->activate(true);
        $this->assertNotSame($old, $new);
        $this->postJson($old, $this->message(1, '/start'))->assertNotFound();
        $this->postJson('/api/v1/bale/process')->assertUnprocessable()->assertJsonPath('error_code', 'webhook_conflict');
        $this->assertNotContains('getUpdates', $this->methods);
        $this->failure = 'delete_false';
        $this->postJson('/api/v1/bale/settings/polling', ['confirm' => true])->assertUnprocessable();
        $this->assertSame('webhook', app(Settings::class)->read()['transport']);
        $this->failure = null;
        $this->postJson('/api/v1/bale/settings/polling', ['confirm' => true])->assertOk();
        $this->postJson($new, $this->message(2, '/start'))->assertNotFound();
        $this->assertNull(app(Settings::class)->read()['webhook_secret']);
        $this->postJson('/api/v1/bale/process')->assertOk();
        $this->assertContains('getUpdates', $this->methods);
    }

    public function test_disabled_bot_does_not_accept_old_valid_capability(): void
    {
        $path = $this->activate();
        $this->putJson('/api/v1/bale/settings', ['enabled' => false])->assertOk();
        $this->postJson($path, $this->message(1, '/start'))->assertNotFound();
        $this->assertDatabaseCount('bale_inbox', 0);
    }

    public function test_registration_rejects_unsupported_ports_without_remote_request(): void
    {
        config(['app.url' => 'https://api.tadbir.example:8443']);
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true])->assertUnprocessable();
        $this->assertSame([], $this->methods);
    }

    public function test_false_registration_is_not_success_and_remote_mismatch_is_visible_without_url(): void
    {
        config(['app.url' => 'https://api.tadbir.example']);
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $this->failure = 'registration_false';
        $this->postJson('/api/v1/bale/settings/webhook', ['confirm' => true, 'acknowledge_secret_url' => true])->assertUnprocessable()
            ->assertJsonPath('error_code', 'invalid_response')->assertJsonPath('data.remote_webhook_matches', false);
        $this->failure = null;
        $this->remoteWebhook = 'https://other.example/private-credential';
        $response = $this->postJson('/api/v1/bale/settings/test')->assertOk()->assertJsonPath('data.webhook_status', 'mismatch');
        $this->assertStringNotContainsString('private-credential', $response->getContent());
    }

    public function test_webhook_cleans_old_payloads_but_keeps_replay_identifiers(): void
    {
        $path = $this->activate();
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->travel(31)->days();
        $this->postJson($path, $this->message(2, '/start'))->assertOk();
        $this->assertDatabaseCount('bale_outbox', 1);
        $this->assertDatabaseCount('bale_inbox', 2);
        $sent = count($this->sent);
        $this->postJson($path, $this->message(1, '/start'))->assertOk();
        $this->assertCount($sent, $this->sent);
    }
}
