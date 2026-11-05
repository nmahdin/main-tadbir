<?php

namespace Tests\Feature\Bale;

use App\Models\BaleOutbox;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * دور ۷۱: کاربری که حسابش به بله متصل نیست هم باید مسیر روشنی برای گرفتن
 * کد یک‌بارمصرف داشته باشد.
 *
 * اگر ارسال به شمارهٔ خودِ کاربر در بله ممکن باشد، کد همان‌جا فرستاده می‌شود؛
 * اگر نباشد، پاسخ صریح «امکان ارسال کد وجود ندارد» است تا کاربر بی‌دلیل منتظر
 * پیامی نماند که هرگز نمی‌آید.
 */
class BaleUnlinkedCodeTest extends TestCase
{
    use BaleTestSupport;
    use RefreshDatabase;

    public function test_unlinked_account_that_cannot_receive_a_code_is_told_so(): void
    {
        $this->ready();
        // بله پیام ربات به شمارهٔ خام (بدون اتصال) را نمی‌پذیرد.
        $this->failure = '403';
        User::factory()->create(['username' => 'no-link-user', 'status' => 'active', 'phone' => '09121234567']);

        $response = $this->postJson('/api/v1/auth/bale/code', ['login' => 'no-link-user', 'purpose' => 'login']);

        $response->assertStatus(422)->assertJsonValidationErrors('login');
        $this->assertStringContainsString('امکان ارسال کد', (string) $response->json('errors.login.0'));
        // کد ناموفق نباید به‌عنوان چالش معتبر باقی بماند.
        $this->assertDatabaseCount('bale_auth_challenges', 0);
    }

    public function test_unlinked_account_without_phone_skips_delivery_and_explains(): void
    {
        $this->ready();
        User::factory()->create(['username' => 'no-phone-user', 'status' => 'active', 'phone' => null]);

        $response = $this->postJson('/api/v1/auth/bale/code', ['login' => 'no-phone-user', 'purpose' => 'login']);

        $response->assertStatus(422)->assertJsonValidationErrors('login');
        $this->assertStringContainsString('امکان ارسال کد', (string) $response->json('errors.login.0'));
        // بدون شماره، هیچ تلاشی برای ارسال انجام نمی‌شود.
        $this->assertNotContains('sendMessage', $this->methods);
    }

    public function test_unlinked_delivery_to_phone_is_attempted_and_queued(): void
    {
        $this->ready();
        User::factory()->create(['username' => 'phone-user', 'status' => 'active', 'phone' => '0912 345 6789']);

        $this->postJson('/api/v1/auth/bale/code', ['login' => 'phone-user', 'purpose' => 'login'])
            ->assertAccepted()
            ->assertJsonMissing(['code']);

        // شمارهٔ نرمال‌شده به‌عنوان مقصد گفت‌وگو استفاده می‌شود.
        $this->assertContains('sendMessage', $this->methods);
        $outbox = BaleOutbox::query()->where('subject_type', 'auth_challenge')->first();
        $this->assertNotNull($outbox);
        $this->assertSame('989123456789', (string) $outbox->chat_id);
        $this->assertFalse((bool) $outbox->requires_link);
    }

    public function test_linked_account_keeps_the_private_chat_flow(): void
    {
        $this->ready();
        $user = User::factory()->create(['username' => 'linked-user', 'status' => 'active', 'phone' => '09120000000']);
        $this->link($user);

        $this->postJson('/api/v1/auth/bale/code', ['login' => 'linked-user', 'purpose' => 'login'])
            ->assertAccepted();

        $outbox = BaleOutbox::query()->where('subject_type', 'auth_challenge')->first();
        $this->assertNotNull($outbox);
        $this->assertSame('991', (string) $outbox->chat_id);
        $this->assertTrue((bool) $outbox->requires_link);
    }
}
