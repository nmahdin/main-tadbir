<?php

namespace Tests\Feature\Bale;

use App\Models\BaleOutbox;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * کد یک‌بارمصرف تنها به گفت‌وگوی خصوصیِ حساب متصل فرستاده می‌شود.
 *
 * ارسال کد به «شمارهٔ ثبت‌شده در سامانه» امکان‌پذیر نیست (بله پیام ربات را به
 * شمارهٔ خام تحویل نمی‌دهد)، پس این مسیر کامل حذف شده و کاربرِ بدون اتصال همان
 * پاسخ صریح «امکان ارسال کد وجود ندارد» را می‌گیرد.
 */
class BaleUnlinkedCodeTest extends TestCase
{
    use BaleTestSupport;
    use RefreshDatabase;

    public function test_unlinked_account_is_told_that_no_code_can_be_sent(): void
    {
        $this->ready();
        // شمارهٔ ثبت‌شده در سامانه هیچ نقشی ندارد: بله پیام ربات به شمارهٔ خام
        // (بدون اتصال) را نمی‌پذیرد، پس حتی تلاشی هم انجام نمی‌شود.
        User::factory()->create(['username' => 'no-link-user', 'status' => 'active', 'phone' => '09121234567']);

        $response = $this->postJson('/api/v1/auth/bale/code', ['login' => 'no-link-user', 'purpose' => 'login']);

        $response->assertStatus(422)->assertJsonValidationErrors('login');
        $this->assertStringContainsString('امکان ارسال کد', (string) $response->json('errors.login.0'));
        // هیچ پیامی به شماره فرستاده نمی‌شود و چالشی هم ساخته نمی‌شود.
        $this->assertNotContains('sendMessage', $this->methods);
        $this->assertDatabaseCount('bale_outbox', 0);
        $this->assertDatabaseCount('bale_auth_challenges', 0);
    }

    public function test_unlinked_account_without_phone_gets_the_same_clear_answer(): void
    {
        $this->ready();
        User::factory()->create(['username' => 'no-phone-user', 'status' => 'active', 'phone' => null]);

        $response = $this->postJson('/api/v1/auth/bale/code', ['login' => 'no-phone-user', 'purpose' => 'password_reset']);

        $response->assertStatus(422)->assertJsonValidationErrors('login');
        $this->assertStringContainsString('امکان ارسال کد', (string) $response->json('errors.login.0'));
        $this->assertNotContains('sendMessage', $this->methods);
        $this->assertDatabaseCount('bale_outbox', 0);
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
