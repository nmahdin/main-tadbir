<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Outbox;
use App\Models\BaleOutbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BaleOutboxFlowOrderTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    public function test_old_main_menu_is_not_replayed_after_a_newer_interactive_prompt(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $outbox = app(Outbox::class);

        // Simulate messages queued while Bale was rate-limiting responses:
        // the first screen is a menu, but a newer update has opened a form.
        $old = $outbox->enqueue('123456:1', $link->chat_id,
            ['text' => 'به تدبیر خوش آمدید.'], $link);
        $new = $outbox->enqueue('123456:2', $link->chat_id,
            ['text' => 'فیلد ۱: مقدار را بنویسید.'], $link);

        $outbox->flush(microtime(true) + 20);

        $this->assertSame('cancelled', $old->fresh()->status);
        $this->assertSame('superseded_flow_reply', $old->fresh()->error_code);
        $this->assertSame('sent', $new->fresh()->status);
        $this->assertCount(1, $this->sent);
        $this->assertSame('فیلد ۱: مقدار را بنویسید.', $this->sent[0]['text']);
    }

    public function test_personalized_welcome_and_old_menu_fallback_are_suppressed_after_a_new_field_prompt(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $outbox = app(Outbox::class);

        $oldHome = $outbox->enqueue('123456:10', $link->chat_id,
            ['text' => 'به تدبیر خوش آمدید کاربر نمونه'], $link);
        $oldFallback = $outbox->enqueue('123456:11', $link->chat_id,
            ['text' => 'برای شروع، /menu را بفرستید. اگر در حال تکمیل فرم بودید، پاسخ‌های آن باید در همان مرحله دریافت شوند.'], $link);
        $field = $outbox->enqueue('123456:12', $link->chat_id,
            ['text' => 'فیلد ۲ از ۶: متن فارسی'], $link);

        $outbox->flush(microtime(true) + 20);

        $this->assertSame('cancelled', $oldHome->fresh()->status);
        $this->assertSame('cancelled', $oldFallback->fresh()->status);
        $this->assertSame('sent', $field->fresh()->status);
        $this->assertCount(1, $this->sent);
        $this->assertSame('فیلد ۲ از ۶: متن فارسی', $this->sent[0]['text']);
    }

    public function test_pending_success_reply_is_never_suppressed_by_later_update(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $outbox = app(Outbox::class);

        $saved = $outbox->enqueue('123456:20', $link->chat_id,
            ['text' => '✅ ردیف ثبت شد.'], $link);
        $new = $outbox->enqueue('123456:21', $link->chat_id,
            ['text' => 'به تدبیر خوش آمدید کاربر نمونه'], $link);

        $outbox->flush(microtime(true) + 20);
        $this->assertSame('sent', $saved->fresh()->status);
        $this->assertSame('sent', $new->fresh()->status);
        $this->assertCount(2, $this->sent);
    }

    public function test_unrelated_notification_is_not_superseded_by_form_replies(): void
    {
        $this->ready();
        $user = $this->user();
        $link = $this->link($user);
        $outbox = app(Outbox::class);

        $a = $outbox->enqueue('notification:sample:1', $link->chat_id,
            ['text' => 'اعلان'], $link);
        $b = $outbox->enqueue('123456:2', $link->chat_id,
            ['text' => 'فرم جدید'], $link);

        // Notifications have their own permission gate and delivery semantics;
        // this assertion verifies the stale-UI rule does not classify them.
        $this->assertFalse((bool) (new \ReflectionMethod(Outbox::class, 'supersededMenuResponse'))
            ->invoke($outbox, $a));
        $this->assertFalse((bool) (new \ReflectionMethod(Outbox::class, 'supersededMenuResponse'))
            ->invoke($outbox, $b));
    }
}
