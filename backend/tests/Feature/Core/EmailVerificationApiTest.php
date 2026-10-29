<?php

namespace Tests\Feature\Core;

use App\Core\Identity\EmailVerificationChallenge;
use App\Core\Identity\EmailVerificationException;
use App\Core\Identity\MailEmailVerificationDelivery;
use App\Core\Identity\MailTransportGuard;
use App\Core\Identity\Mail\EmailVerificationMail;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C6-3 — verified-email HTTP endpoints over the C6-2
 * service, the real Laravel Mail adapter, and its explicit
 * production transport guard.
 */
class EmailVerificationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        $this->user = User::factory()->create(['username' => 'mail_user', 'status' => 'active']);
    }

    public function test_full_verification_flow_through_http_and_mail_fake(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->user);

        $this->getJson('/api/v1/auth/email/verification')->assertOk()
            ->assertJsonPath('data.email', null)
            ->assertJsonPath('data.email_verified', false);

        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'Person@Example.com'])
            ->assertStatus(202)
            ->assertJsonPath('data.email', 'person@example.com')
            ->assertJsonPath('data.delivery', 'sent');

        // The challenge exists only as a hash; the raw token lives in the mailed link.
        $challenge = EmailVerificationChallenge::query()->sole();
        $sent = null;
        Mail::assertSent(EmailVerificationMail::class, function (EmailVerificationMail $mail) use (&$sent) {
            $sent = $mail;

            return $mail->hasTo('person@example.com');
        });
        parse_str((string) parse_url($sent->verificationUrl, PHP_URL_QUERY), $query);
        $token = $query['token'];
        $this->assertSame(hash('sha256', $token), $challenge->token_hash);
        $this->assertStringNotContainsString($token, (string) $challenge->token_hash);

        // Responses never carry the raw challenge.
        $confirm = $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.email', 'person@example.com')
            ->assertJsonPath('data.email_verified', true);
        $this->assertStringNotContainsString($token, $confirm->getContent());

        // Consumed challenges and unknown tokens fail closed.
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $token])
            ->assertUnprocessable()->assertJsonPath('code', 'email_verification_invalid');
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => str_repeat('a', 64)])
            ->assertUnprocessable()->assertJsonPath('code', 'email_verification_invalid');

        // A challenge never verifies another account.
        $other = User::factory()->create(['username' => 'mail_other', 'status' => 'active']);
        Sanctum::actingAs($other);
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'other@example.com'])->assertStatus(202);
        $otherToken = null;
        Mail::assertSent(EmailVerificationMail::class, function (EmailVerificationMail $mail) use (&$otherToken) {
            if ($mail->hasTo('other@example.com')) {
                parse_str((string) parse_url($mail->verificationUrl, PHP_URL_QUERY), $query);
                $otherToken = $query['token'];
            }

            return true;
        });
        Sanctum::actingAs($this->user);
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $otherToken])
            ->assertUnprocessable()->assertJsonPath('code', 'email_verification_invalid');
    }

    public function test_expired_challenge_and_email_change_invalidate_over_http(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->user);

        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'first@example.com'])->assertStatus(202);
        $firstToken = $this->sentToken('first@example.com');

        $this->travelTo(new CarbonImmutable('2026-06-01 12:30:00', 'UTC')); // exact expiry instant
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $firstToken])
            ->assertUnprocessable()->assertJsonPath('code', 'email_verification_expired');

        // Verify a second address, then change it: verification dies with the change.
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'second@example.com'])->assertStatus(202);
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->sentToken('second@example.com')])
            ->assertOk()->assertJsonPath('data.email_verified', true);

        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'third@example.com'])->assertStatus(202);
        $this->getJson('/api/v1/auth/email/verification')->assertOk()
            ->assertJsonPath('data.email', 'third@example.com')
            ->assertJsonPath('data.email_verified', false);

        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->sentToken('third@example.com')])
            ->assertOk()->assertJsonPath('data.email_verified', true);
    }

    public function test_verification_endpoints_are_rate_limited_and_require_auth(): void
    {
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'a@b.co'])->assertUnauthorized();

        Mail::fake();
        Sanctum::actingAs($this->user);
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/v1/auth/email/verification/request', ['email' => "user{$i}@example.com"])->assertStatus(202);
        }
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'user6@example.com'])->assertStatus(429);
    }

    public function test_transport_failure_surfaces_and_the_challenge_can_be_retried(): void
    {
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => '127.0.0.1', 'mail.mailers.smtp.port' => 1]);
        Sanctum::actingAs($this->user);

        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'retry@example.com'])
            ->assertStatus(502)->assertJsonPath('code', 'email_delivery_failed');
        $this->assertSame(1, EmailVerificationChallenge::query()->whereNull('consumed_at')->count(), 'challenge stands after transport failure');

        Mail::fake();
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'retry@example.com'])->assertStatus(202);
        $this->assertSame(1, EmailVerificationChallenge::query()->whereNull('consumed_at')->count(), 'new request supersedes the undelivered challenge');
    }

    public function test_production_guard_refuses_log_and_array_transports(): void
    {
        config(['mail.default' => 'array']);
        $originalEnv = $this->app['env'];
        $this->app->instance('env', 'production');

        try {
            MailTransportGuard::assertDeliverable();
            $this->fail('Expected email_delivery_unavailable');
        } catch (EmailVerificationException $exception) {
            $this->assertSame('email_delivery_unavailable', $exception->errorCode);
        } finally {
            $this->app->instance('env', $originalEnv);
        }

        // Testing/local environments remain deliverable through fakes.
        MailTransportGuard::assertDeliverable();
        $this->assertTrue(true);
    }

    public function test_mail_content_is_escaped_and_contains_secure_links(): void
    {
        $mail = new EmailVerificationMail('https://app.example.test/verify-email?token=abc&email=a%40b.co', 30, '<Admin>');
        $html = $mail->render();
        $this->assertStringContainsString('https://app.example.test/verify-email?token=abc', $html);
        $this->assertStringNotContainsString('<Admin>', $html);
        $this->assertStringContainsString('&lt;Admin&gt;', $html);

        $delivery = new MailEmailVerificationDelivery;
        Mail::fake();
        $delivery->deliver($this->user, 'direct@example.com', 'RAW_TOKEN', CarbonImmutable::now('UTC')->addMinutes(30));
        Mail::assertSent(EmailVerificationMail::class, fn (EmailVerificationMail $sent) => $sent->hasTo('direct@example.com')
            && str_contains($sent->verificationUrl, 'token=RAW_TOKEN'));
    }

    private function sentToken(string $email): string
    {
        $token = null;
        Mail::assertSent(EmailVerificationMail::class, function (EmailVerificationMail $mail) use ($email, &$token) {
            if ($mail->hasTo($email)) {
                parse_str((string) parse_url($mail->verificationUrl, PHP_URL_QUERY), $query);
                $token = $query['token'];
            }

            return true;
        });
        $this->assertIsString($token);

        return $token;
    }
}
