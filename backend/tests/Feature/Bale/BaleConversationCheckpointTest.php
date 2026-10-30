<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Automations;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

class BaleConversationCheckpointTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant($user): void
    {
        foreach (['assets.view', 'assets.upload', 'assets.edit_info', 'tasks.view'] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], [
                'label' => $key, 'category' => 'tests',
            ]);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    private function startSixFieldAutomation(): void
    {
        $this->ready();
        $user = $this->user(true);
        $this->grant($user);
        $this->link($user);
        $department = Department::create(['name' => 'روایت', 'status' => 'active']);
        $department->members()->attach($user);
        $names = ['متن عربی', 'متن فارسی', 'راوی', 'منبع', 'موضوع', 'توضیح'];
        $columns = [];
        foreach ($names as $i => $name) {
            $columns[] = ['id' => 'field_'.$i, 'name' => $name, 'type' => 'text', 'required' => false];
        }
        $table = DamDataTable::create([
            'name' => 'ثبت روایت', 'created_by' => $user->id, 'columns' => $columns,
        ]);
        $table->departments()->attach($department);

        $automations = app(Automations::class);
        $automations->save($user, [
            'revision' => $automations->read()['revision'],
            'rules' => [[
                'id' => (string) Str::uuid(),
                'name' => 'ثبت روایت', 'enabled' => true,
                'trigger_type' => 'command', 'trigger' => '/revayat',
                'action' => 'table_row', 'response' => null,
                'table_id' => $table->id, 'department_id' => null,
            ]],
        ]);
        $this->tick([$this->message(1, '/revayat')]);
        $this->assertSame('asset_field', BaleConversation::first()?->step);
        $this->assertStringContainsString('فیلد 1 از 6', end($this->sent)['text']);
    }

    public function test_diagnostics_trace_the_six_field_automation_without_logging_its_text(): void
    {
        config(['bale.flow_diagnostics' => true]);
        Log::spy();

        $this->startSixFieldAutomation();
        $this->tick([$this->message(2, 'این متن نباید در لاگ نوشته شود')]);

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($name, $ctx) => $name === 'bale_flow_trace'
                && ($ctx['event'] ?? null) === 'checkpoint_saved'
                && ($ctx['step'] ?? null) === 'asset_field'
                && isset($ctx['conversation_ref'])
                && ! str_contains(json_encode($ctx, JSON_UNESCAPED_UNICODE), 'این متن')
        )->atLeast()->once();

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($name, $ctx) => $name === 'bale_flow_trace'
                && ($ctx['event'] ?? null) === 'incoming'
                && ($ctx['update_id'] ?? null) === 2
                && ($ctx['step'] ?? null) === 'asset_field'
                && ($ctx['kind'] ?? null) === 'text'
                && ! array_key_exists('text', $ctx)
                && ! array_key_exists('chat_id', $ctx)
                && ! array_key_exists('nonce', $ctx)
        )->once();

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($name, $ctx) => $name === 'bale_flow_trace'
                && ($ctx['event'] ?? null) === 'routed'
                && ($ctx['update_id'] ?? null) === 2
                && ($ctx['field_index'] ?? null) === 1
        )->once();
    }

    public function test_diagnostics_are_disabled_by_default(): void
    {
        config(['bale.flow_diagnostics' => false]);
        Log::spy();
        $this->startSixFieldAutomation();

        Log::shouldNotHaveReceived('warning');
    }

    public function test_six_field_automation_recovers_missing_session_and_consumes_arabic_and_persian_text(): void
    {
        $this->startSixFieldAutomation();

        $first = BaleOutbox::where('deduplication_key', '123456:1')->firstOrFail();
        $this->assertSame('asset_field', $first->payload['_flow_checkpoint']['step']);
        $this->assertArrayNotHasKey('_flow_checkpoint', end($this->sent),
            'Internal recovery metadata must never reach Bale API.');

        // Reproduce the screenshot's production symptom: the question was
        // delivered, but its conversation row is gone before the answer.
        BaleConversation::query()->delete();
        $this->tick([$this->message(2, 'عربی')]);

        $session = BaleConversation::firstOrFail();
        $this->assertSame('asset_field', $session->step);
        $this->assertSame(1, $session->data['index']);
        $this->assertSame('عربی', $session->data['cells']['field_0']);
        $this->assertStringContainsString('متن فارسی', end($this->sent)['text']);
        $this->assertStringNotContainsString('برای شروع، /menu', end($this->sent)['text']);

        BaleConversation::query()->delete();
        $this->tick([$this->message(3, 'فارسی')]);

        $session = BaleConversation::firstOrFail();
        $this->assertSame(2, $session->data['index']);
        $this->assertSame('فارسی', $session->data['cells']['field_1']);
        $this->assertSame('عربی', $session->data['cells']['field_0']);

        // Finish all six fields and confirm a REAL row, not only an in-memory draft.
        $tableId = $session->data['table_id'];
        foreach (['راوی آزمون', 'منبع آزمون', 'موضوع آزمون', 'توضیح آزمون'] as $i => $value) {
            $this->tick([$this->message($i + 4, $value)]);
        }
        $this->assertSame('asset_confirm', BaleConversation::first()?->step);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(8, 'confirm:'.$nonce)]);
        $this->assertNull(BaleConversation::first());
        $table = DamDataTable::findOrFail($tableId);
        $this->assertSame(1, $table->rows()->count());
    }

    public function test_uploaded_file_title_recovers_after_missing_session(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->user(true);
        $this->grant($user);
        $this->link($user);
        $this->tick([$this->document(1, 'روایت.txt')]);
        $this->assertSame('asset_file_title', BaleConversation::first()?->step);

        BaleConversation::query()->delete();
        $this->tick([$this->message(2, 'نام دلخواه فایل')]);
        $session = BaleConversation::firstOrFail();
        $this->assertSame('asset_file_confirm', $session->step);
        $this->assertSame('نام دلخواه فایل', $session->data['title']);
    }

    public function test_explicit_cancel_prevents_recovery_of_an_older_form_checkpoint(): void
    {
        $this->startSixFieldAutomation();
        $this->tick([$this->message(2, '/cancel')]);
        $this->assertNull(BaleConversation::first());
        $this->tick([$this->message(3, 'عربی')]);
        $this->assertNull(BaleConversation::first());
        $this->assertStringContainsString('برای شروع، /menu', end($this->sent)['text']);
    }

    public function test_expired_checkpoint_does_not_resurrect_draft(): void
    {
        $this->startSixFieldAutomation();
        // Expiring the checkpoint is different from merely deleting the row.
        $entry = BaleOutbox::where('deduplication_key', '123456:1')->firstOrFail();
        $payload = $entry->payload;
        $payload['_flow_checkpoint']['expires_at'] = now()->subMinute()->toIso8601String();
        $entry->update(['payload' => $payload]);
        BaleConversation::query()->delete();

        $this->tick([$this->message(2, 'عربی')]);
        $this->assertNull(BaleConversation::first());
        $this->assertStringContainsString('برای شروع، /menu', end($this->sent)['text']);
    }
}
