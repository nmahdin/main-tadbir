<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Bot\Bale\UpdateProcessor;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BaleAutomationsTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant(User $user): void
    {
        foreach (['assets.view', 'assets.upload', 'thinktank.view'] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    private function rule(string $action = 'reply', array $extra = []): array
    {
        return [...['id' => (string) Str::uuid(), 'name' => 'Test rule', 'enabled' => true,
            'trigger_type' => 'command', 'trigger' => '/revayat', 'action' => $action,
            'response' => $action === 'reply' ? 'پاسخ امن' : null, 'table_id' => null, 'department_id' => null], ...$extra];
    }

    private function configure(array $rules): void
    {
        app(Automations::class)->save($this->user(true), ['revision' => app(Automations::class)->read()['revision'], 'rules' => $rules]);
    }

    private function table(User $user): array
    {
        $this->grant($user);
        $department = Department::create(['name' => 'تیم روایت', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'روایات', 'created_by' => $user->id,
            'columns' => [['id' => 'body', 'name' => 'متن روایت', 'type' => 'text', 'required' => true]]]);
        $table->departments()->attach($department);

        return [$department, $table];
    }

    private function callbacks(array $message): array
    {
        return collect($message['reply_markup']['inline_keyboard'] ?? [])->flatten(1)->pluck('callback_data')->filter()->values()->all();
    }

    public function test_home_has_no_panel_notifications_cancel_or_home_buttons(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->tick([$this->message(1, '/start')]);
        $this->assertSame(['tasks', 'meetings', 'assets', 'profile'], $this->callbacks(end($this->sent)));
        $this->assertStringContainsString('ثبت دارایی', json_encode(end($this->sent), JSON_UNESCAPED_UNICODE));
        $this->assertStringNotContainsString('url', json_encode(end($this->sent)));
        $this->tick([$this->buttonUpdate(2, 'profile')]);
        $this->assertNotContains('notifications', $this->callbacks(end($this->sent)));
        $this->assertNotContains('cancel', $this->callbacks(end($this->sent)));
    }

    public function test_asset_choices_are_separate_and_cancel_only_appears_during_drafts(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->tick([$this->buttonUpdate(1, 'assets')]);
        $this->assertSame(['assetfile:0', 'assettext:0', 'assetrows', 'home'], $this->callbacks(end($this->sent)));
        $this->tick([$this->buttonUpdate(2, 'assettext:0')]);
        $this->assertContains('cancel', $this->callbacks(end($this->sent)));
        $this->tick([$this->message(3, '/cancel')]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertNotContains('cancel', $this->callbacks(end($this->sent)));
        $this->tick([$this->buttonUpdate(4, 'assetrows')]);
        $this->assertNotContains('cancel', $this->callbacks(end($this->sent)));
    }

    public function test_standalone_text_is_private_confirmed_and_not_duplicated(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->tick([$this->buttonUpdate(1, 'assettext:0'), $this->message(2, 'عنوان'), $this->message(3, 'متن')]);
        $this->assertDatabaseCount('dam_assets', 0);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce), $this->buttonUpdate(5, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 1);
        $this->assertSame('confidential', DamAsset::first()->confidentiality);
        $this->assertSame('متن', DamAsset::first()->contentItem->content_body);
        $this->assertFalse(DamAsset::first()->relations()->exists());
        $this->assertNotContains('cancel', $this->callbacks($this->sent[3]));
    }

    public function test_file_choice_opens_real_generic_or_task_scoped_secure_form(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'assetfile:0'), $this->buttonUpdate(2, 'assetfile:'.$task->id)]);
        $this->assertStringContainsString('?dam_entry=file', json_encode($this->sent[0]));
        $this->assertStringContainsString('?task='.$task->id.'&asset=file', json_encode($this->sent[1]));
        $this->assertStringNotContainsString(self::TOKEN, json_encode($this->sent));
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_settings_are_permission_guarded_and_not_in_generic_settings(): void
    {
        $this->getJson('/api/v1/bale/settings/automations')->assertUnauthorized();
        Sanctum::actingAs($this->user());
        $this->getJson('/api/v1/bale/settings/automations')->assertForbidden();
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => []])->assertForbidden();
        Sanctum::actingAs($this->user(true));
        $rule = $this->rule();
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => [$rule]])->assertOk()->assertJsonPath('data.revision', 1);
        $this->getJson('/api/v1/settings/'.Automations::KEY)->assertNotFound();
        $this->assertDatabaseHas('activity_logs', ['type' => 'bale_automations_changed']);
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => []])->assertConflict();
        $this->assertCount(1, app(Automations::class)->read()['rules']);
    }

    public function test_reserved_duplicate_and_executable_rules_are_rejected(): void
    {
        Sanctum::actingAs($this->user(true));
        foreach ([['trigger' => '/start'], ['trigger' => '/a b'], ['trigger_type' => 'text', 'trigger' => '/x'], ['action' => 'sql'], ['action' => 'reply', 'response' => ''], ['action' => 'table_row', 'table_id' => 999, 'department_id' => 999]] as $patch) {
            $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => [$this->rule(extra: $patch)]])->assertUnprocessable();
        }
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => [$this->rule(extra: ['trigger' => '/TEST']), $this->rule(extra: ['trigger' => '/test'])]])->assertUnprocessable();
    }

    public function test_exact_text_normalizes_persian_and_response_is_plain_and_replay_safe(): void
    {
        $this->ready();
        $this->link($this->user());
        $this->configure([$this->rule(extra: ['trigger_type' => 'text', 'trigger' => 'یک پیام', 'response' => '[text](https://example.test)'])]);
        $this->tick([$this->message(1, ' يك   پيام ')]);
        $this->assertStringContainsString('［text］', $this->sent[0]['text']);
        $this->assertArrayNotHasKey('_automation', $this->sent[0]);
        $this->tick([$this->message(1, ' يك   پيام ')]);
        $this->assertCount(1, $this->sent);
        $this->tick([$this->message(2, 'یک پیام دیگر')]);
        $this->assertStringContainsString('به تدبیر خوش آمدید', end($this->sent)['text']);
    }

    public function test_command_opens_specific_table_and_commits_one_row_after_confirmation(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->table($user);
        $this->configure([$this->rule('table_row', ['table_id' => $table->id, 'department_id' => $department->id])]);
        $this->tick([$this->message(1, '/REVAYAT')]);
        $this->assertSame('asset_field', BaleConversation::first()->step);
        $this->assertSame($table->id, BaleConversation::first()->data['table_id']);
        $this->tick([$this->message(2, 'روایت اول')]);
        $this->assertSame(0, $table->rows()->count());
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce), $this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertSame(1, $table->rows()->count());
        $this->assertSame('روایت اول', $table->rows()->first()->cells['body']);
    }

    public function test_command_does_not_bypass_membership_and_revocation_blocks_commit(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->table($user);
        $this->configure([$this->rule('table_row', ['table_id' => $table->id, 'department_id' => $department->id])]);
        $this->tick([$this->message(1, '/revayat'), $this->message(2, 'ثبت نشود')]);
        $nonce = BaleConversation::first()->nonce;
        $department->members()->detach($user->id);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce), $this->message(4, '/revayat')]);
        $this->assertSame(0, $table->rows()->count());
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_disabled_or_edited_rule_invalidates_an_existing_draft(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $rule = $this->rule('asset_text');
        $this->configure([$rule]);
        $this->tick([$this->message(1, '/revayat'), $this->message(2, 'عنوان'), $this->message(3, 'متن')]);
        $nonce = BaleConversation::first()->nonce;
        $this->configure([[...$rule, 'enabled' => false]]);
        $this->tick([$this->buttonUpdate(4, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('dam_assets', 0);
        $this->assertDatabaseCount('bale_conversations', 0);
    }

    public function test_active_form_consumes_text_not_trigger_and_commands_do_not_overwrite_draft(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->configure([$this->rule(extra: ['trigger_type' => 'text', 'trigger' => 'سلام'])]);
        $this->tick([$this->buttonUpdate(1, 'assettext:0'), $this->message(2, 'سلام')]);
        $this->assertSame('سلام', BaleConversation::first()->data['title']);
        $this->tick([$this->message(3, '/unknown')]);
        $this->assertSame('text_asset_body', BaleConversation::first()->step);
        $this->assertStringContainsString('/cancel', end($this->sent)['text']);
    }

    public function test_rule_change_revokes_queued_reply_before_outbound_send(): void
    {
        $this->ready();
        $this->link($this->user());
        $rule = $this->rule();
        $this->configure([$rule]);
        app(UpdateProcessor::class)->process($this->message(1, '/revayat'));
        $this->configure([[...$rule, 'response' => 'changed']]);
        app(Outbox::class)->flush(microtime(true) + 20);
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertCount(0, $this->sent);
    }

    public function test_unlinked_and_blocked_accounts_do_not_run_rules(): void
    {
        $this->ready();
        $this->configure([$this->rule()]);
        $this->tick([$this->message(1, '/revayat')]);
        $this->assertStringContainsString('کد', $this->sent[0]['text']);
        $user = $this->user();
        $this->link($user);
        $user->update(['status' => 'blocked']);
        $this->tick([$this->message(2, '/revayat')]);
        $this->assertCount(1, $this->sent);
    }

    public function test_forged_internal_reply_callback_never_executes_a_configured_rule(): void
    {
        $this->ready();
        $this->link($this->user());
        $this->configure([$this->rule()]);
        $this->tick([$this->buttonUpdate(1, 'automation_reply')]);
        $this->assertStringContainsString('به تدبیر خوش آمدید', end($this->sent)['text']);
    }

    public function test_trigger_rate_limit_is_per_link_and_duplicate_update_does_not_consume_it(): void
    {
        $this->ready();
        $link = $this->link($this->user());
        $this->configure([$this->rule()]);
        for ($i = 1; $i <= 20; $i++) {
            app(UpdateProcessor::class)->process($this->message($i, '/revayat'));
        }
        app(UpdateProcessor::class)->process($this->message(20, '/revayat'));
        $this->assertSame(20, RateLimiter::attempts('bale-rule:'.$link->id));
        app(UpdateProcessor::class)->process($this->message(21, '/revayat'));
        $this->assertStringContainsString('یک دقیقه', BaleOutbox::where('deduplication_key', '123456:21')->first()->payload['text']);
    }

    public function test_admin_can_edit_disable_and_delete_rules_without_changing_bot_credentials(): void
    {
        $this->ready();
        Sanctum::actingAs($this->user(true));
        $rule = $this->rule();
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 0, 'rules' => [$rule]])->assertOk();
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 1, 'rules' => [[...$rule, 'response' => 'ویرایش', 'enabled' => false]]])
            ->assertOk()->assertJsonPath('data.rules.0.enabled', false);
        $this->putJson('/api/v1/bale/settings/automations', ['revision' => 2, 'rules' => []])->assertOk()->assertJsonPath('data.rules', []);
        $this->assertSame(self::TOKEN, app(Settings::class)->token());
    }

    public function test_table_schema_change_during_custom_form_blocks_creation(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$department, $table] = $this->table($user);
        $this->configure([$this->rule('table_row', ['table_id' => $table->id, 'department_id' => $department->id])]);
        $this->tick([$this->message(1, '/revayat'), $this->message(2, 'متن')]);
        $nonce = BaleConversation::first()->nonce;
        $table->update(['columns' => [['id' => 'replacement', 'name' => 'New', 'type' => 'number', 'required' => true]]]);
        $this->tick([$this->buttonUpdate(3, 'confirm:'.$nonce)]);
        $this->assertSame(0, $table->rows()->count());
    }
}
