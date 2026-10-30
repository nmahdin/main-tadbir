<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Support\MenuNavigation;
use App\Models\BaleConversation;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * جریانِ بات هرگز وسطِ کار به «منوی اصلی» پرت نمی‌شود.
 *
 * سه مسیرِ واقعیِ خروجِ ناخواسته پوشش داده می‌شود:
 * ۱) صفحهٔ انتخاب جدول (`asset_context`) در فهرستِ فرم‌های بات نبود؛ هر متن،
 *    برچسب یا فرمانِ ناشناخته کاربر را به منوی اصلی می‌برد.
 * ۲) دکمه‌ای که به هیچ مسیری نمی‌خورد (پیامِ کهنه) پاسخش منوی اصلی بود.
 * ۳) متنِ برابر با محرکِ یک قاعدهٔ خودکارسازی، وسطِ جریان قاعده را اجرا و
 *    نشست را پاک می‌کرد.
 */
class BaleFlowResilienceTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private const WELCOME = 'به تدبیر خوش آمدید';

    private function grant(User $user): void
    {
        foreach (['tasks.view', 'tasks.edit', 'assets.view', 'assets.upload', 'assets.edit_info'] as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    /** @return array{0: DamDataTable, 1: Department} */
    private function table(User $user): array
    {
        $department = Department::create(['name' => 'تیم محتوا', 'status' => 'active']);
        $department->members()->attach($user);
        $table = DamDataTable::create(['name' => 'روایت‌ها', 'created_by' => $user->id,
            'columns' => [['id' => 'body', 'name' => 'متن روایت', 'type' => 'text', 'required' => true]]]);
        $table->departments()->attach($department);

        return [$table, $department];
    }

    private function lastText(): string
    {
        return (string) (end($this->sent)['text'] ?? '');
    }

    /** @return array<int, string> */
    private function lastCallbacks(): array
    {
        return collect(end($this->sent)['reply_markup']['inline_keyboard'] ?? [])->flatten(1)->pluck('callback_data')->filter()->values()->all();
    }

    public function test_a_text_during_table_selection_keeps_the_flow_alive(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);

        // مسیرِ واقعی: ثبت دارایی → اطلاعات جدول → انتخاب جدول.
        $this->tick([$this->buttonUpdate(1, 'assets')]);
        $this->tick([$this->buttonUpdate(2, 'assetrows')]);
        $session = BaleConversation::first();
        $this->assertSame('asset_context', $session->step);

        $this->sent = [];
        $this->tick([$this->message(3, 'یک توضیح نامربوط')]);

        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());
        $this->assertStringContainsString('انتخاب جدول اطلاعات', $this->lastText());
        $this->assertSame('asset_context', BaleConversation::first()->step);
        // دکمهٔ «لغو» هم برای خروجِ آگاهانه هست.
        $this->assertContains('cancel', $this->lastCallbacks());

        // و فرم با همان دکمهٔ جدول ادامه پیدا می‌کند.
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'assettable:'.$nonce.':0')]);
        $this->assertSame('asset_field', BaleConversation::first()->step);
    }

    public function test_a_sticker_during_table_selection_does_not_reset_the_flow(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);
        $this->tick([$this->buttonUpdate(1, 'assetrows')]);

        $this->sent = [];
        $this->tick([['update_id' => 2, 'message' => ['from' => ['id' => '991'], 'chat' => ['id' => '991', 'type' => 'private'], 'sticker' => ['file_id' => 'st-1']]]]);

        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());
        $this->assertSame('asset_context', BaleConversation::first()->step);
    }

    public function test_an_unknown_button_never_returns_the_main_menu_during_a_flow(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $task = Task::create(['title' => 'نوشتن گزارش', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);
        $this->tick([$this->buttonUpdate(1, 'report:'.$task->id)]);
        $this->assertSame('report_text', BaleConversation::first()->step);

        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'unknownbutton')]);

        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());
        $this->assertStringContainsString('پیش‌نویس شما محفوظ است', $this->lastText());
        $this->assertStringContainsString('ثبت گزارش', $this->lastText());
        $this->assertSame('report_text', BaleConversation::first()->step);

        // متنِ گزارش همچنان در همان جریان ثبت می‌شود.
        $this->sent = [];
        $this->tick([$this->message(3, 'متن گزارش من')]);
        $this->assertStringContainsString('پیش‌نمایش گزارش', $this->lastText());
    }

    public function test_an_unknown_button_without_a_flow_only_explains_how_to_open_the_menu(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);

        $this->tick([$this->buttonUpdate(1, 'unknownbutton')]);
        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());
        $this->assertStringContainsString('/menu', $this->lastText());

        $this->tick([$this->message(2, 'متن نامشخص')]);
        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());

        $this->tick([$this->message(3, '/menu')]);
        $this->assertStringContainsString(self::WELCOME, $this->lastText());
    }

    public function test_a_stale_table_button_keeps_the_selection_and_says_why(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);
        $this->tick([$this->buttonUpdate(1, 'assetrows')]);

        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'assettable:'.str_repeat('b', 24).':0')]);

        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());
        $this->assertStringContainsString('انتخاب جدول اطلاعات', $this->lastText());
        $this->assertSame('asset_context', BaleConversation::first()->step);
    }

    public function test_an_automation_trigger_does_not_fire_inside_the_flow(): void
    {
        $this->ready();
        $owner = $this->user(true);
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);
        app(Automations::class)->save($owner, [
            'revision' => app(Automations::class)->read()['revision'],
            'rules' => [[
                'id' => (string) Str::uuid(), 'name' => 'پاسخ متنی', 'enabled' => true,
                'trigger_type' => 'text', 'trigger' => 'ادامه', 'action' => 'reply',
                'response' => 'این پاسخِ قاعده است', 'table_id' => null, 'department_id' => null,
            ]],
        ]);
        $this->tick([$this->buttonUpdate(1, 'assetrows')]);

        $this->sent = [];
        $this->tick([$this->message(2, 'ادامه')]);

        $this->assertStringNotContainsString('این پاسخِ قاعده است', $this->lastText());
        $this->assertStringContainsString('انتخاب جدول اطلاعات', $this->lastText());
        $this->assertSame('asset_context', BaleConversation::first()->step);
    }

    /**
     * ماتریسِ کامل: در هیچ مرحله‌ای از هیچ جریانی، پاسخِ متن/دکمهٔ ناشناخته/برچسب
     * «منوی اصلی» نیست. این آزمون هر مرحلهٔ تازه را هم خودکار پوشش می‌دهد.
     */
    public function test_no_step_of_any_flow_falls_back_to_the_main_menu(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $link = $this->link($user);
        $task = Task::create(['title' => 'وظیفه', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);
        [$table] = $this->table($user);

        $steps = [...MenuNavigation::DRAFTING, 'asset_context'];
        $id = 500;
        foreach ($steps as $step) {
            foreach (['text', 'button', 'sticker'] as $kind) {
                BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => $step, 'nonce' => str_repeat('a', 24),
                    'data' => ['task_id' => $task->id, 'table_id' => $table->id, 'department_id' => null, 'version' => 'v', 'index' => 0, 'cells' => []],
                    'expires_at' => MenuNavigation::lifetime()]);
                $this->sent = [];
                $this->tick([match ($kind) {
                    'text' => $this->message($id++, 'یک پاسخ نامربوط'),
                    'button' => $this->buttonUpdate($id++, 'unknownbutton'),
                    'sticker' => ['update_id' => $id++, 'message' => ['from' => ['id' => '991'], 'chat' => ['id' => '991', 'type' => 'private'], 'sticker' => ['file_id' => 'st-1']]],
                }]);
                $this->assertStringNotContainsString(self::WELCOME, $this->lastText(), $step.' ['.$kind.']');
                $this->assertNotNull(BaleConversation::first(), $step.' ['.$kind.'] نشست پاک شد');
            }
        }
    }

    /**
     * دکمه‌های کهنه/بخش‌های دیگر هم وسطِ جریان «منوی اصلی» نمی‌آورند؛ نهایتاً
     * پیامِ روشن یا همان جریان.
     */
    public function test_stale_and_foreign_buttons_never_answer_with_the_main_menu(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $link = $this->link($user);
        $task = Task::create(['title' => 'وظیفه', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);
        [$table] = $this->table($user);
        $nonce = str_repeat('c', 24);

        $buttons = ['unknownbutton', 'subject:1', 'assettable:'.$nonce.':0', 'assetpick:'.$nonce.':0', 'confirm:'.$nonce,
            'choose:'.$nonce.':open', 'outdone:'.$nonce, 'taskasset:'.$task->id, 'assets', 'assetsend:0', 'assettext:0',
            'assetfile:0', 'assetrows', 'tableform:'.$table->id, 'tasks', 'taskfilters', 'profile', 'pubinfo:'.$task->id];

        $id = 900;
        foreach (['asset_context', 'asset_field', 'output_text', 'report_text', 'done_confirm'] as $step) {
            foreach ($buttons as $button) {
                BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => $step, 'nonce' => $nonce,
                    'data' => ['task_id' => $task->id, 'table_id' => $table->id, 'department_id' => null, 'version' => 'v', 'index' => 0, 'cells' => []],
                    'expires_at' => MenuNavigation::lifetime()]);
                $this->sent = [];
                $this->tick([$this->buttonUpdate($id++, $button)]);
                $this->assertStringNotContainsString(self::WELCOME, $this->lastText(), $step.' + '.$button);
            }
        }
    }

    public function test_old_content_output_button_cannot_steal_a_table_row_draft(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);

        $this->tick([$this->buttonUpdate(1, 'assetrows')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(2, 'assettable:'.$nonce.':0')]);
        $this->assertSame('asset_field', BaleConversation::first()->step);

        // Old notification buttons previously reached the output handler,
        // which could abort with 404 and erase the table draft.
        $this->sent = [];
        $this->tick([$this->buttonUpdate(3, 'pubouttext:999999')]);
        $this->assertSame('asset_field', BaleConversation::first()->step);
        $this->assertStringContainsString('محفوظ', $this->lastText());
        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());

        $this->tick([$this->message(4, 'متن درست برای ردیف')]);
        $this->assertSame('asset_confirm', BaleConversation::first()->step);
        $this->assertSame('متن درست برای ردیف', BaleConversation::first()->data['cells']['body']);
    }

    public function test_file_title_survives_foreign_buttons_and_is_used_as_the_title(): void
    {
        Storage::fake('local');
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);

        $this->tick([$this->document(1, 'پیوست.txt')]);
        $this->assertSame('asset_file_title', BaleConversation::first()->step);

        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'puboutfile:999999')]);
        $this->assertSame('asset_file_title', BaleConversation::first()->step);
        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());

        $this->tick([$this->message(3, 'نام انتخابی فایل')]);
        $this->assertSame('asset_file_confirm', BaleConversation::first()->step);
        $this->assertSame('نام انتخابی فایل', BaleConversation::first()->data['title']);
        $this->assertStringContainsString('نام انتخابی فایل', $this->lastText());
    }

    public function test_stale_home_callback_is_not_implicit_navigation(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);

        $this->tick([$this->buttonUpdate(1, 'assetrows')]);
        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'puboutadd:999999')]);
        $this->assertSame('asset_context', BaleConversation::first()->step);
        $this->assertStringNotContainsString(self::WELCOME, $this->lastText());

        // Only an explicit home action (or /menu) can display home.
        $this->tick([$this->buttonUpdate(3, 'home')]);
        $this->assertNull(BaleConversation::first());
        $this->assertStringContainsString(self::WELCOME, $this->lastText());
    }

    public function test_cancel_still_ends_the_selection_flow_explicitly(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->table($user);
        $this->tick([$this->buttonUpdate(1, 'assetrows')]);

        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'cancel')]);

        $this->assertStringContainsString(self::WELCOME, $this->lastText());
        $this->assertNull(BaleConversation::first());
    }
}
