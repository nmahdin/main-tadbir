<?php

namespace Tests\Feature\Bale;

use App\Models\Content as ContentModel;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentPublication;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * دور ۸۷ — سه اصلاحِ کارتابل بات:
 *
 *  ۱. فهرست وظایف، همهٔ کارهای باز را **به ترتیب مهلت** می‌آورد (قدیمی‌ترین
 *     اول، بدون‌مهلت آخر) و کار عقب‌افتاده را نشانه می‌زند.
 *  ۲. دکمهٔ «دریافت فایل» پیامِ اطلاعات انتشار را پاک نمی‌کند؛ همان پیام می‌ماند
 *     تا فایل بعدی یا کپیِ کپشن از همان‌جا ممکن باشد.
 *  ۳. با تأییدِ «تکمیل»، پیام موفقیت صریح فرستاده می‌شود.
 *
 * همچنین رگرسیونِ بازگشتِ بی‌پایان در ساخت دکمهٔ «اطلاعات انتشار».
 */
class BaleRound87Test extends TestCase
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
        $role = Role::create(['key' => 'round87_'.Str::random(8), 'name' => 'Round 87 test']);
        foreach ($keys as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'test']));
        }
        $user->update(['role_id' => $role->id]);
    }

    /** دکمه‌ای با شناسهٔ پیامِ واقعی؛ پاک‌سازیِ پیام فقط با همین شناسه رخ می‌دهد. */
    private function buttonWithMessage(int $id, string $data, int $messageId, string $sender = '991'): array
    {
        return ['update_id' => $id, 'callback_query' => ['id' => 'cb'.$id, 'from' => ['id' => $sender], 'data' => $data,
            'message' => ['message_id' => $messageId, 'chat' => ['id' => $sender, 'type' => 'private']]]];
    }

    public function test_task_list_is_ordered_by_deadline_and_marks_overdue(): void
    {
        $user = $this->user();
        $this->grant($user, ['tasks.view']);
        $this->link($user);
        $this->ready();

        $later = $this->task($user, 'کار آینده');
        $later->update(['deadline' => now()->addDays(2)->toDateString()]);
        $overdue = $this->task($user, 'کار عقب‌افتاده');
        $overdue->update(['deadline' => now()->subDays(6)->toDateString()]);
        $noDeadline = $this->task($user, 'کار بدون مهلت');

        $this->tick([$this->buttonUpdate(10, 'tasks')]);

        $this->assertNotEmpty($this->sent, 'فهرست وظایف باید فرستاده شود.');
        $text = (string) $this->sent[0]['text'];
        $this->assertStringContainsString('به ترتیب مهلت', $text);
        $overdueAt = mb_strpos($text, 'کار عقب‌افتاده');
        $laterAt = mb_strpos($text, 'کار آینده');
        $noneAt = mb_strpos($text, 'کار بدون مهلت');
        $this->assertNotFalse($overdueAt);
        $this->assertNotFalse($laterAt);
        $this->assertNotFalse($noneAt);
        // قدیمی‌ترین مهلت اول، بعد مهلت آینده، و بدون‌مهلت در پایان.
        $this->assertLessThan($laterAt, $overdueAt);
        $this->assertLessThan($noneAt, $laterAt);
        $this->assertStringContainsString('گذشته', $text);
    }

    public function test_file_button_keeps_the_publish_info_message(): void
    {
        $user = $this->user();
        $this->grant($user, ['tasks.view']);
        $this->link($user);
        $this->ready();

        $this->tick([$this->buttonWithMessage(11, 'pubfile:content:999999:0', 77)]);

        // پیامِ اطلاعات انتشار نباید پاک شود؛ فقط فایل/خطا فرستاده می‌شود.
        $this->assertNotContains('deleteMessage', $this->methods);
        $this->assertContains('sendMessage', $this->methods);

        // کنترل: دکمهٔ دیگر همان پیام را مثل قبل پاک می‌کند.
        $this->methods = [];
        $this->tick([$this->buttonWithMessage(12, 'pubinfo:content:999999', 78)]);
        $this->assertContains('deleteMessage', $this->methods);
    }

    public function test_confirming_completion_sends_explicit_success_message(): void
    {
        $user = $this->user();
        $this->grant($user, ['tasks.view']);
        $this->link($user);
        $this->ready();

        $task = $this->task($user, 'کار مهم');

        $this->tick([$this->buttonUpdate(13, 'done:'.$task->id)]);
        $prompt = (string) json_encode($this->sent[0]['reply_markup'] ?? []);
        $this->assertMatchesRegularExpression('/confirm:([a-f0-9]{24})/', $prompt, 'درخواست تأیید تکمیل فرستاده نشد.');
        preg_match('/confirm:([a-f0-9]{24})/', $prompt, $matches);

        $this->tick([$this->buttonUpdate(14, 'confirm:'.$matches[1])]);

        $last = $this->sent[count($this->sent) - 1];
        $this->assertStringContainsString('با موفقیت تکمیل شد', (string) $last['text']);
        $this->assertStringContainsString('کار مهم', (string) $last['text']);
        $this->assertSame('completed', $task->fresh()->status);
    }

    public function test_publish_info_button_does_not_recurse(): void
    {
        $user = $this->user();
        $this->grant($user, ['tasks.view', 'content.view']);
        $this->link($user);
        $this->ready();

        $content = ContentModel::create([
            'title' => 'پرونده انتشار',
            'type' => 'article',
            'status' => 'ready_to_publish',
            'owner_id' => $user->id,
            'payload' => ['publishInfo' => ['date' => now()->toDateString(), 'time' => '10:00', 'caption' => 'متن کپشن']],
        ]);
        $task = Task::create(['title' => 'انتشار محتوا', 'assignee_id' => $user->id, 'status' => 'backlog',
            'priority' => 'medium', 'kind' => ContentPublication::KIND, 'content_id' => $content->id]);

        $this->tick([$this->buttonUpdate(15, 'pubinfo:'.$task->id)]);

        $this->assertNotEmpty($this->sent, 'اطلاعات انتشار باید فرستاده شود.');
        $this->assertStringContainsString('اطلاعات انتشار', (string) $this->sent[0]['text']);
        $buttons = (string) json_encode($this->sent[0]['reply_markup'] ?? []);
        // دکمه‌های همان پیام به وظیفه برمی‌گردند (کپی کپشن/فایل)، نه به حلقهٔ بازگشتی
        // که پیش‌تر خطای ۵۰۰ می‌داد.
        $this->assertStringContainsString('pubcap:'.$task->id, $buttons);
        $this->assertStringContainsString('task:'.$task->id, $buttons);
    }
}
