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
        $this->assertFalse((bool) (new \ReflectionMethod(Outbox::class, 'supersededInteractiveResponse'))
            ->invoke($outbox, $a));
        $this->assertFalse((bool) (new \ReflectionMethod(Outbox::class, 'supersededInteractiveResponse'))
            ->invoke($outbox, $b));
    }
}
