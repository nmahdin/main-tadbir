<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Identity\EmailVerificationChallenge;
use App\Core\Identity\EmailVerificationDelivery;
use App\Core\Identity\EmailVerificationException;
use App\Core\Identity\EmailVerificationService;
use App\Core\Identity\UnavailableEmailVerificationDelivery;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Verified email identity (Stage C6-2): hashed single-use
 * challenges, atomic consumption, email-change invalidation,
 * duplicate-ownership handling, fail-closed default delivery,
 * and untouched username authentication.
 */
class VerifiedEmailTest extends TestCase
{
    use RefreshDatabase;

    private CapturingEmailDelivery $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        $this->delivery = new CapturingEmailDelivery;
        $this->app->instance(EmailVerificationDelivery::class, $this->delivery);
    }

    public function test_username_authentication_remains_functional(): void
    {
        $user = User::factory()->create(['username' => 'legacy_login', 'status' => 'active']);

        $this->assertTrue(Auth::attempt(['username' => 'legacy_login', 'password' => 'password']));
        $this->assertSame($user->id, (int) Auth::id());
        Auth::logout();
        $this->assertFalse(Auth::attempt(['username' => 'legacy_login', 'password' => 'wrong-password']));
    }

    public function test_challenge_issuance_hashes_secrets_and_verifies_nothing_yet(): void
    {
        $service = app(EmailVerificationService::class);
        $user = User::factory()->create(['username' => 've_user', 'status' => 'active']);

        $issued = $service->requestChallenge($user, '  Person@Example.COM ');

        $fresh = $user->fresh();
        $this->assertSame('person@example.com', $fresh->email);
        $this->assertNull($fresh->email_verified_at, 'a submitted address is never auto-verified');
        $this->assertNull($service->verifiedEmail($user));

        $challenge = EmailVerificationChallenge::query()->sole();
        $this->assertSame(hash('sha256', $issued->rawToken), $challenge->token_hash);
        $this->assertNotSame($issued->rawToken, $challenge->token_hash);
        $this->assertGreaterThanOrEqual(43, strlen($issued->rawToken));

        $audit = AuditLog::query()->where('action', 'identity.email_verification_requested')->sole();
        $this->assertStringNotContainsString($issued->rawToken, (string) json_encode($audit->summary));
    }

    public function test_confirmation_consumes_atomically_and_reuse_fails(): void
    {
        $service = app(EmailVerificationService::class);
        $user = User::factory()->create(['username' => 've_confirm', 'status' => 'active']);
        $service->requestChallenge($user, 'confirm@example.com');
        $token = $this->delivery->lastToken();

        $this->assertEmailFails('email_verification_invalid', fn () => $service->confirmEmail($user, 'wrong-token'));

        // A challenge never verifies a different account.
        $other = User::factory()->create(['username' => 've_other', 'status' => 'active']);
        $this->assertEmailFails('email_verification_invalid', fn () => $service->confirmEmail($other, $token));

        $verified = $service->confirmEmail($user, $token);
        $this->assertNotNull($verified->email_verified_at);
        $this->assertSame('confirm@example.com', $service->verifiedEmail($user));
        $this->assertNotNull(EmailVerificationChallenge::query()->sole()->consumed_at);

        $this->assertEmailFails('email_verification_invalid', fn () => $service->confirmEmail($user, $token));
    }

    public function test_expired_challenge_and_email_change_invalidation(): void
    {
        $service = app(EmailVerificationService::class);
        $user = User::factory()->create(['username' => 've_change', 'status' => 'active']);

        $service->requestChallenge($user, 'first@example.com');
        $firstToken = $this->delivery->lastToken();
        $service->confirmEmail($user, $firstToken);
        $this->assertSame('first@example.com', $service->verifiedEmail($user));

        // Changing the address invalidates prior verification and
        // the (already consumed) earlier challenge proves nothing.
        $service->requestChallenge($user, 'second@example.com');
        $secondToken = $this->delivery->lastToken();
        $this->assertNull($service->verifiedEmail($user), 'unverified until the new address is proven');
        $this->assertNull($user->fresh()->email_verified_at);

        // Exact expiry boundary: at expires_at the challenge is dead.
        $this->travelTo(new CarbonImmutable('2026-06-01 12:30:00', 'UTC'));
        $this->assertEmailFails('email_verification_expired', fn () => $service->confirmEmail($user, $secondToken));

        $service->requestChallenge($user, 'second@example.com');
        $service->confirmEmail($user, $this->delivery->lastToken());
        $this->assertSame('second@example.com', $service->verifiedEmail($user));
    }

    public function test_duplicate_email_ownership_is_rejected(): void
    {
        $service = app(EmailVerificationService::class);
        $first = User::factory()->create(['username' => 've_first', 'status' => 'active']);
        $second = User::factory()->create(['username' => 've_second', 'status' => 'active']);

        $service->requestChallenge($first, 'shared@example.com');
        $this->assertEmailFails('email_already_claimed', fn () => $service->requestChallenge($second, 'SHARED@example.com'));
        $this->assertNull($second->fresh()->email, 'the rejected claim changed nothing');
    }

    public function test_default_delivery_binding_fails_closed(): void
    {
        $this->app->instance(EmailVerificationDelivery::class, new UnavailableEmailVerificationDelivery);
        $service = app(EmailVerificationService::class);
        $user = User::factory()->create(['username' => 've_nodelivery', 'status' => 'active']);

        // Without the test double, the container default cannot
        // verify anyone.
        $this->assertEmailFails('email_delivery_unavailable', fn () => $service->requestChallenge($user, 'never@example.com'));
        $this->assertNull($service->verifiedEmail($user));
    }

    private function assertEmailFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected email failure [{$code}].");
        } catch (EmailVerificationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
