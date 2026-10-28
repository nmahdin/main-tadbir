<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Automations;
use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Models\BaleConversation;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * اصلاح‌های این دور در بات بله:
 * ۱) اعلانِ وظیفهٔ تازهٔ محتوا دکمهٔ «ثبت خروجی محتوا» دارد.
 * ۲) متنِ خروجی می‌تواند چندبخشی باشد و در پایان یکجا ثبت شود.
 * ۳) متنِ تازه می‌تواند به خروجیِ متنیِ ثبت‌شدهٔ همان مرحله افزوده شود.
 * ۴) محرکِ خودکارسازی با نامِ ربات در فرمان و نویسه‌های نامرئی هم تطبیق می‌خورد.
 * ۵) فرمانِ ناشناخته پاسخِ روشن می‌گیرد (نه پیامِ خوش‌آمدگویی).
 */
class BaleContentOutputAndAutomationFixesTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant(User $user, array $keys = ['tasks.view', 'content.view', 'assets.view']): void
    {
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    /** پروندهٔ محتوا با یک مرحلهٔ باز و وظیفهٔ همان مرحله برای کاربر. */
    private function stageTask(User $user, array $outputs = []): array
    {
        $this->grant($user);
        $content = Content::create([
            'title' => 'پروندهٔ روایت', 'type' => 'article', 'status' => 'in_progress', 'owner_id' => $user->id,
            'payload' => ['stages' => [[
                'id' => 'stage-a', 'title' => 'نگارش', 'order' => 0, 'status' => 'in_progress',
                'assigneeId' => (string) $user->id, 'reviewRequired' => false, 'outputs' => $outputs,
            ]]],
        ]);
        $task = Task::create(['title' => 'نگارش روایت', 'assignee_id' => $user->id, 'status' => 'in_progress',
            'priority' => 'medium', 'kind' => 'content', 'content_id' => $content->id, 'content_stage_id' => 'stage-a']);

        return [$content, $task];
    }

    public function test_new_content_task_notification_offers_the_output_button(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $link = $this->link($user);
        [, $task] = $this->stageTask($user);

        $record = DomainRecord::create([
            'domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $link->user_id, 'title' => 'وظیفهٔ جدید',
            'payload' => ['title' => 'وظیفهٔ جدید', 'type' => 'assignment', 'notificationCategory' => 'tasks',
                'message' => 'وظیفهٔ «نگارش روایت» به شما واگذار شد.', 'linkTaskId' => (string) $task->id],
        ]);
        app(NotificationDelivery::class)->created($record);

        $this->assertCount(1, $this->sent);
        $callbacks = collect($this->sent[0]['reply_markup']['inline_keyboard'] ?? [])->flatten(1)->pluck('callback_data')->all();
        $this->assertContains('pubout:'.$task->id, $callbacks);
        $this->assertContains('task:'.$task->id, $callbacks);
    }

    public function test_long_text_output_is_sent_in_parts_and_registered_once(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$content, $task] = $this->stageTask($user);

        $this->tick([$this->buttonUpdate(1, 'pubout:'.$task->id)]);
        $this->assertStringContainsString('نوشتن متن خروجی', json_encode(end($this->sent), JSON_UNESCAPED_UNICODE));

        $this->tick([$this->buttonUpdate(2, 'pubouttext:'.$task->id)]);
        $this->assertSame('output_text', BaleConversation::first()->step);

        // دو بخش متن؛ هیچ‌کدام به‌تنهایی «خروجی» نیست.
        $this->tick([$this->message(3, 'بخش اول متن خروجی')]);
        $this->assertSame('output_text', BaleConversation::first()->step);
        $this->tick([$this->message(4, 'بخش دوم متن خروجی')]);
        $this->assertSame('output_text', BaleConversation::first()->step);

        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(5, 'outdone:'.$nonce)]);
        $this->assertSame('output_confirm', BaleConversation::first()->step);
        $this->tick([$this->buttonUpdate(6, 'confirm:'.$nonce)]);

        $outputs = $content->refresh()->payload['stages'][0]['outputs'];
        $this->assertCount(1, $outputs);
        $this->assertSame("بخش اول متن خروجی\nبخش دوم متن خروجی", $outputs[0]['value']);
        $this->assertTrue($outputs[0]['isDelivered']);
    }

    public function test_new_text_can_be_appended_to_the_registered_output(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        [$content, $task] = $this->stageTask($user, [[
            'id' => 'out-existing', 'name' => 'نگارش', 'isDelivered' => true, 'value' => 'بخش اول ثبت‌شده',
        ]]);

        $this->tick([$this->buttonUpdate(1, 'pubout:'.$task->id)]);
        $this->assertStringContainsString('puboutadd:'.$task->id, json_encode(end($this->sent)));

        $this->tick([$this->buttonUpdate(2, 'puboutadd:'.$task->id)]);
        $this->assertSame('out-existing', BaleConversation::first()->data['append_to']);

        $this->tick([$this->message(3, 'بخش دوم')]);
        $nonce = BaleConversation::first()->nonce;
        $this->tick([$this->buttonUpdate(4, 'outdone:'.$nonce), $this->buttonUpdate(5, 'confirm:'.$nonce)]);

        $outputs = $content->refresh()->payload['stages'][0]['outputs'];
        $this->assertCount(1, $outputs);
        $this->assertSame('out-existing', $outputs[0]['id']);
        $this->assertSame("بخش اول ثبت‌شده\nبخش دوم", $outputs[0]['value']);
    }

    public function test_command_with_bot_name_and_invisible_characters_still_matches(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        app(Automations::class)->save($this->user(true), ['revision' => 0, 'rules' => [[
            'id' => '3f0b4c0e-6d1a-4f2b-9c31-2a5d6e7f8a90', 'name' => 'روایت', 'enabled' => true,
            'trigger_type' => 'command', 'trigger' => '/revayat', 'action' => 'reply',
            'response' => 'پاسخ خودکار', 'table_id' => null, 'department_id' => null,
        ]]]);

        // نامِ ربات به فرمان چسبیده است؛ پیش‌تر هیچ تطبیقی نداشت.
        $this->tick([$this->message(1, '/revayat@tadbir_bot')]);
        $this->assertStringContainsString('پاسخ خودکار', end($this->sent)['text']);
    }

    public function test_text_trigger_matches_with_zwnj_and_persian_digits(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);
        app(Automations::class)->save($this->user(true), ['revision' => 0, 'rules' => [[
            'id' => '8d5c2b71-9a3e-4c58-b4d2-1e7f0a9b3c62', 'name' => 'مرحله', 'enabled' => true,
            'trigger_type' => 'text', 'trigger' => 'مرحله ۳ آماده است', 'action' => 'reply',
            'response' => 'دریافت شد', 'table_id' => null, 'department_id' => null,
        ]]]);

        // نیم‌فاصلهٔ نامرئی و رقم فارسی؛ نرمال‌سازی هر دو طرف یکسان است.
        $this->tick([$this->message(1, 'مرحله ۳ آماده است')]);
        $this->assertStringContainsString('دریافت شد', end($this->sent)['text']);
    }

    public function test_unknown_command_gets_a_clear_answer_instead_of_the_welcome_message(): void
    {
        $this->ready();
        $user = $this->user();
        $this->link($user);

        $this->tick([$this->message(1, '/nope')]);

        $text = (string) end($this->sent)['text'];
        $this->assertStringContainsString('خودکارسازی', $text);
        $this->assertStringNotContainsString('به تدبیر خوش آمدید', $text);
    }
}
