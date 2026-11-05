<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Auth\AccountLinker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * دور ۷۳: وقتی کد اتصال پذیرفته می‌شود، ربات باید صریحاً پیام موفقیت بفرستد.
 *
 * پیش از این، کد مصرف می‌شد و جریان بی‌صدا به منوی عادی می‌رسید؛ کاربر
 * مطمئن نمی‌شد اتصال انجام شده است.
 */
class Round73LinkSuccessTest extends TestCase
{
    use BaleTestSupport;
    use RefreshDatabase;

    public function test_accepted_code_sends_an_explicit_success_message_with_the_menu(): void
    {
        $this->ready();
        $user = $this->user();
        $code = app(AccountLinker::class)->issue($user)['code'];

        $this->tick([$this->message(1, $code)]);

        $this->assertCount(1, $this->sent);
        $text = (string) $this->sent[0]['text'];
        $this->assertStringContainsString('✅', $text);
        $this->assertStringContainsString('متصل شد', $text);
        $this->assertStringContainsString($user->name, $text);
        // پیام موفقیت جای منوی عمومی را می‌گیرد، نه اینکه کنارش بیاید.
        $this->assertStringNotContainsString('به تدبیر خوش آمدید', $text);
        $this->assertNotEmpty($this->sent[0]['reply_markup']['inline_keyboard'] ?? []);
        $this->assertDatabaseHas('bale_user_links', ['user_id' => $user->id, 'bale_user_id' => '991']);
        $this->assertDatabaseCount('bale_link_codes', 0);
        $this->assertDatabaseHas('activity_logs', ['type' => 'bale_account_linked']);
    }

    public function test_invalid_code_still_answers_with_the_connection_help_only(): void
    {
        $this->ready();

        $this->tick([$this->message(1, 'FFFFFFFFFF')]);

        $this->assertCount(1, $this->sent);
        $text = (string) $this->sent[0]['text'];
        $this->assertStringContainsString('کد نامعتبر', $text);
        $this->assertStringNotContainsString('✅', $text);
        $this->assertDatabaseCount('bale_user_links', 0);
    }
}
