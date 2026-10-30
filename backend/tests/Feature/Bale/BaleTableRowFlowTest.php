<?php

namespace Tests\Feature\Bale;

use App\Models\BaleConversation;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Full table-row flow, including the six-field narrative automation path. */
final class BaleTableRowFlowTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant(User $user): void
    {
        foreach (['assets.view', 'assets.edit_info', 'assets.upload'] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key],
                ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    private function table(User $user, array $columns): DamDataTable
    {
        $department = Department::create(['name' => 'گروه روایت', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create([
            'name' => 'جدول روایت', 'created_by' => $user->id, 'columns' => $columns,
        ]);
        $table->departments()->attach($department);

        return $table;
    }

    private function openTable(User $user, DamDataTable $table): void
    {
        $this->tick([$this->buttonUpdate(1, 'tableform:'.$table->id)]);
        $this->assertSame('asset_field', BaleConversation::first()?->step);
    }

    private function lastText(): string
    {
        return end($this->sent)['text'] ?? '';
    }

    private function callbacks(): array
    {
        return collect(end($this->sent)['reply_markup']['inline_keyboard'] ?? [])
            ->flatten(1)->pluck('callback_data')->filter()->values()->all();
    }

    public function test_home_text_is_only_a_personalized_greeting(): void
    {
        $this->ready();
        $user = $this->user();
        $user->update(['name' => 'کاربر نمونه']);
        $this->link($user);

        $this->tick([$this->message(1, '/menu')]);
        $this->assertSame('به تدبیر خوش آمدید کاربر نمونه', $this->lastText());
        $this->assertContains('tasks', $this->callbacks());
    }

    public function test_cancel_command_returns_to_personalized_home_without_resurrecting_draft(): void
    {
        $this->ready();
        $user = $this->user();
        $user->update(['name' => 'ثبت‌کننده روایت']);
        $this->grant($user);
        $this->link($user);
        $table = $this->table($user, [
            ['id' => 'arabic', 'name' => 'متن عربی', 'type' => 'text', 'required' => true],
            ['id' => 'persian', 'name' => 'متن فارسی', 'type' => 'text', 'required' => true],
        ]);
        $this->openTable($user, $table);
        $this->tick([$this->message(2, 'متن عربی')]);
        $this->assertSame(1, BaleConversation::first()->data['index']);

        $this->tick([$this->message(3, '/cancel')]);
        $this->assertNull(BaleConversation::first());
        $this->assertSame('به تدبیر خوش آمدید ثبت‌کننده روایت', $this->lastText());
        $this->assertCount(0, $table->rows()->get());

        // An old encrypted checkpoint must not recover an explicitly
        // cancelled flow; ordinary text is no longer treated as a field.
        $this->tick([$this->message(4, 'فارسی')]);
        $this->assertNull(BaleConversation::first());
        $this->assertCount(0, $table->rows()->get());
    }

    public function test_six_fields_can_be_answered_reviewed_edited_and_saved_once(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $columns = array_map(fn ($i) => [
            'id' => 'c'.$i, 'name' => 'فیلد '.$i, 'type' => 'text',
            'required' => true,
        ], range(0, 5));
        $table = $this->table($user, $columns);
        $this->openTable($user, $table);

        foreach (['عربی', 'فارسی', 'راوی', 'منبع', 'موضوع', 'توضیحات'] as $i => $value) {
            $this->tick([$this->message($i + 2, $value)]);
            $this->assertSame($value, BaleConversation::first()->data['cells']['c'.$i]);
        }
        $session = BaleConversation::firstOrFail();
        $this->assertSame('asset_confirm', $session->step);
        $this->assertSame(0, $table->rows()->count());
        $this->assertStringContainsString('بازبینی ردیف', $this->lastText());

        // Editing a previous field returns to review, retaining the remaining 5.
        $this->tick([$this->buttonUpdate(8, 'assetedit:'.$session->nonce.':1')]);
        $this->assertSame('asset_field', BaleConversation::first()->step);
        $this->assertSame(1, BaleConversation::first()->data['index']);
        $this->tick([$this->message(9, 'فارسی ویرایش‌شده')]);
        $this->assertSame('asset_confirm', BaleConversation::first()->step);
        $this->assertSame('عربی', BaleConversation::first()->data['cells']['c0']);
        $this->assertSame('موضوع', BaleConversation::first()->data['cells']['c4']);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(10, 'confirm:'.$nonce),
            $this->buttonUpdate(11, 'confirm:'.$nonce)]);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertSame(1, $table->rows()->count());
        $this->assertSame('فارسی ویرایش‌شده', $table->rows()->first()->cells['c1']);
    }

    public function test_back_skip_invalid_and_stale_buttons_keep_the_correct_column(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $table = $this->table($user, [
            ['id' => 'body', 'name' => 'متن', 'type' => 'text', 'required' => true],
            ['id' => 'optional', 'name' => 'یادداشت', 'type' => 'text', 'required' => false],
            ['id' => 'number', 'name' => 'شماره', 'type' => 'number', 'required' => true],
        ]);
        $this->openTable($user, $table);
        $this->assertNotContains('assetskip:'.BaleConversation::first()->nonce, $this->callbacks());
        $this->tick([$this->message(2, 'روایت اول')]);
        $firstNonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'assetskip:'.$firstNonce)]);
        $this->assertSame(2, BaleConversation::first()->data['index']);
        $this->assertArrayHasKey('optional', BaleConversation::first()->data['cells']);
        $this->assertNull(BaleConversation::first()->data['cells']['optional']);
        $this->tick([$this->message(4, 'غیرعددی')]);
        $this->assertSame(2, BaleConversation::first()->data['index']);
        $this->assertStringContainsString('شماره', $this->lastText());

        $current = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(5, 'assetback:'.$current)]);
        $this->assertSame(1, BaleConversation::first()->data['index']);
        $this->tick([$this->buttonUpdate(6, 'assetskip:'.$firstNonce)]);
        $this->assertSame(1, BaleConversation::first()->data['index'], 'Old skipped-column button must be inert.');
        $this->tick([$this->message(7, 'یادداشت جدید')]);
        $this->assertSame(2, BaleConversation::first()->data['index']);
        $this->tick([$this->message(8, '42')]);
        $this->assertSame('asset_confirm', BaleConversation::first()->step);
        $this->assertSame('یادداشت جدید', BaleConversation::first()->data['cells']['optional']);
    }

    public function test_select_and_boolean_buttons_are_bound_to_the_current_nonce(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $table = $this->table($user, [
            ['id' => 'language', 'name' => 'زبان', 'type' => 'select', 'required' => true,
                'options' => ['عربی', 'فارسی']],
            ['id' => 'approved', 'name' => 'تأیید', 'type' => 'boolean', 'required' => true],
        ]);
        $this->openTable($user, $table);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(2, 'assetpick:'.$nonce.':1')]);
        $this->assertSame('فارسی', BaleConversation::first()->data['cells']['language']);
        $secondNonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(3, 'assetpick:'.$nonce.':0')]);
        $this->assertSame(1, BaleConversation::first()->data['index']);
        $this->tick([$this->buttonUpdate(4, 'assetbool:'.$secondNonce.':0')]);
        $this->assertSame('asset_confirm', BaleConversation::first()->step);
        $this->assertSame('0', BaleConversation::first()->data['cells']['approved']);
    }

    public function test_schema_change_never_interprets_a_reply_as_a_different_column(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $table = $this->table($user, [
            ['id' => 'a', 'name' => 'الف', 'type' => 'text', 'required' => true],
            ['id' => 'b', 'name' => 'ب', 'type' => 'text', 'required' => true],
        ]);
        $this->openTable($user, $table);
        $this->tick([$this->message(2, 'پاسخ اول')]);
        $table->update(['columns' => [
            ['id' => 'a', 'name' => 'الف', 'type' => 'text', 'required' => true],
            ['id' => 'c', 'name' => 'ستون جدید', 'type' => 'text', 'required' => true],
        ]]);
        $this->tick([$this->message(3, 'پاسخ مربوط به فرم قدیمی')]);
        $session = BaleConversation::firstOrFail();
        $this->assertSame('asset_field', $session->step);
        $this->assertSame('پاسخ اول', $session->data['cells']['a']);
        $this->assertArrayNotHasKey('c', $session->data['cells']);
        $this->assertSame(1, $session->data['index']);
        $this->tick([$this->message(4, 'پاسخ جدید')]);
        $this->assertSame('asset_confirm', BaleConversation::first()->step);
        $this->assertSame('پاسخ جدید', BaleConversation::first()->data['cells']['c']);
    }
}
