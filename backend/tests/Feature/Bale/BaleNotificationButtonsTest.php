<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Models\BaleConversation;
use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskAssignmentNotifications;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * دکمه‌های زیرِ پیامِ «وظیفهٔ جدید» در بات بله.
 *
 * ۱) اعلانِ واگذاریِ وظیفهٔ عادی پیش‌تر بی‌دکمه بود؛ حالا «جزئیات وظیفه» و
 *    «تکمیل وظیفه» را دارد و هر دو واقعاً کار می‌کنند.
 * ۲) وظیفهٔ تکمیل‌شده دکمهٔ تکمیل ندارد (وابستگی: وظیفهٔ بسته‌شده هرگز
 *    دکمهٔ تکمیل نمی‌گیرد).
 * ۳) اعلانِ وظیفهٔ محتوا همان دکمه‌های خروجی را نگه می‌دارد و «جزئیات وظیفه»
 *    دوباره اضافه نمی‌شود.
 * ۴) دکمهٔ اعلان وسطِ فرمِ باز هم بی‌پاسخ نمی‌ماند: یک دکمهٔ «لغو فرم و ادامه»
 *    همان انتخاب را با یک ضربه اجرا می‌کند و پیش‌نویس تا آن لحظه محفوظ است.
 */
class BaleNotificationButtonsTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    private function grant(User $user, array $keys = ['tasks.view']): void
    {
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']);
            $user->role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user->unsetRelation('role');
    }

    /** اعلانِ «وظیفهٔ جدید» از همان مسیر واقعی تولید اعلان. */
    private function notify(Task $task): DomainRecord
    {
        return app(TaskAssignmentNotifications::class)->created($task);
    }

    /** @return array<int, string> */
    private function callbacks(int $index = 0): array
    {
        return collect($this->sent[$index]['reply_markup']['inline_keyboard'] ?? [])
            ->flatten(1)->pluck('callback_data')->all();
    }

    public function test_plain_task_notification_has_working_buttons(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $task = $this->task($user, 'تنظیم گزارش هفتگی');

        $this->notify($task);

        $callbacks = $this->callbacks();
        $this->assertContains('task:'.$task->id, $callbacks);
        $this->assertContains('done:'.$task->id, $callbacks);

        // «جزئیات وظیفه» همان صفحهٔ وظیفه را باز می‌کند.
        $this->sent = [];
        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $this->assertStringContainsString('تنظیم گزارش هفتگی', (string) ($this->sent[0]['text'] ?? ''));

        // «تکمیل وظیفه» مستقیم فرم تأیید را می‌آورد (نه منوی وضعیت).
        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'done:'.$task->id)]);
        $this->assertStringContainsString('تأیید تکمیل', json_encode($this->sent, JSON_UNESCAPED_UNICODE));
        $this->assertSame('done_confirm', BaleConversation::where('link_id', $user->id)->value('step'));
    }

    public function test_completed_task_notification_offers_no_complete_button(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $task = $this->task($user, 'وظیفهٔ بسته‌شده');
        $task->update(['status' => 'completed']);

        $this->notify($task);

        $callbacks = $this->callbacks();
        $this->assertContains('task:'.$task->id, $callbacks);
        $this->assertNotContains('done:'.$task->id, $callbacks);
    }

    public function test_content_stage_notification_keeps_its_output_button_without_duplicates(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'content.view']);
        $this->link($user);
        $content = Content::create(['title' => 'پروندهٔ روایت', 'type' => 'article', 'status' => 'in_progress', 'owner_id' => $user->id,
            'payload' => ['stages' => [['id' => 'stage-a', 'title' => 'نگارش', 'order' => 0, 'status' => 'in_progress',
                'assigneeId' => (string) $user->id, 'reviewRequired' => false, 'outputs' => []]]]]);
        $task = Task::create(['title' => 'نگارش روایت', 'assignee_id' => $user->id, 'status' => 'in_progress', 'priority' => 'medium',
            'kind' => 'content', 'content_id' => $content->id, 'content_stage_id' => 'stage-a']);

        $this->notify($task);

        $callbacks = $this->callbacks();
        $this->assertContains('pubout:'.$task->id, $callbacks);
        $this->assertSame(1, count(array_keys($callbacks, 'task:'.$task->id, true)), 'دکمهٔ جزئیات نباید تکراری باشد');
    }

    public function test_notification_button_during_an_open_form_still_runs_after_one_tap(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $task = $this->task($user, 'تنظیم گزارش هفتگی');

        // فرمِ بازِ گزارش: کاربر وسطِ نوشتن بود که اعلان رسید.
        $this->tick([$this->buttonUpdate(1, 'report:'.$task->id)]);
        $this->assertSame('report_text', BaleConversation::first()->step);

        $this->notify($task);
        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'done:'.$task->id)]);

        // پیش‌نویس پاک نمی‌شود، ولی دکمه بی‌پاسخ هم نمی‌ماند.
        $this->assertSame('report_text', BaleConversation::first()->step);
        $this->assertStringContainsString('پیش‌نویس شما محفوظ است', (string) ($this->sent[0]['text'] ?? ''));
        $this->assertContains('flowdrop:done:'.$task->id, $this->callbacks());

        // همان دکمه، فرم را می‌بندد و انتخابِ قبلی را اجرا می‌کند.
        $this->sent = [];
        $this->tick([$this->buttonUpdate(3, 'flowdrop:done:'.$task->id)]);
        $this->assertSame('done_confirm', BaleConversation::first()->step);
        $this->assertStringContainsString('تأیید تکمیل', json_encode($this->sent, JSON_UNESCAPED_UNICODE));
    }

    public function test_flowdrop_ignores_an_invalid_wrapped_action(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $this->tick([$this->buttonUpdate(1, 'report:'.$this->task($user)->id)]);

        $this->sent = [];
        $this->tick([$this->buttonUpdate(2, 'flowdrop:%$^&*')]);

        // پیش‌نویس با یک callback نامعتبر پاک نمی‌شود.
        $this->assertSame('report_text', BaleConversation::first()->step);
    }

    public function test_notification_button_is_not_sent_when_the_task_is_not_assigned_to_the_user(): void
    {
        $this->ready();
        $user = $this->user();
        $this->grant($user);
        $this->link($user);
        $other = $this->user();
        $task = $this->task($other, 'وظیفهٔ همکار');

        $record = DomainRecord::create(['domain' => DomainRecord::DOMAIN_NOTIFICATION, 'user_id' => $user->id, 'title' => 'وظیفهٔ جدید',
            'payload' => ['title' => 'وظیفهٔ جدید', 'type' => 'assignment', 'notificationCategory' => 'tasks',
                'message' => 'وظیفهٔ همکار واگذار شد.', 'linkTaskId' => (string) $task->id]]);
        app(NotificationDelivery::class)->created($record);

        $this->assertSame([], $this->callbacks());
    }
}
