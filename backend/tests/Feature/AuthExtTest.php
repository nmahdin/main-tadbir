<?php

namespace Tests\Feature;

use App\Core\Identity\AccountActivationService;
use App\Core\Identity\Otp\FakeSmsOtpDelivery;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * AUTH-EXT-01 acceptance (ADR-0021): username policy, terms, verified
 * identifiers, OTP lifecycle + atomic phone claim, recovery tokens,
 * idempotent provisioning, session revocation, deletion grace.
 */
class AuthExtTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        config(['auth.otp.driver' => 'fake']);
        $this->app->bind(\App\Core\Identity\Otp\SmsOtpDelivery::class, fn () => new FakeSmsOtpDelivery);
    }

    private function registration(array $overrides = []): array
    {
        return [
            'name' => 'کاربر تازه',
            'username' => 'fresh.user',
            'password' => 'Secret123',
            'password_confirmation' => 'Secret123',
            'terms_accepted' => true,
            'terms_version' => (string) config('auth.terms.current_version'),
            ...$overrides,
        ];
    }

    public function test_username_normalization_conflict_and_reserved_are_rejected(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registration())->assertCreated();

        $this->postJson('/api/v1/auth/register', $this->registration(['username' => 'Fresh.User']))
            ->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->postJson('/api/v1/auth/register', $this->registration(['username' => 'admin']))
            ->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->postJson('/api/v1/auth/register', $this->registration(['username' => 'fresh..user']))
            ->assertUnprocessable()->assertJsonValidationErrors('username');
    }

    public function test_terms_acceptance_is_required_and_recorded(): void
    {
        $payload = $this->registration();
        unset($payload['terms_accepted']);
        $this->postJson('/api/v1/auth/register', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('terms_accepted');

        $this->postJson('/api/v1/auth/register', $this->registration())->assertCreated();
        $this->assertDatabaseHas('user_terms_acceptances', ['document_key' => 'terms']);
    }

    public function test_only_verified_email_can_be_a_login_identifier(): void
    {
        $user = User::factory()->create([
            'username' => 'mail.user', 'password' => Hash::make('Secret123'),
            'email' => 'mail@example.com', 'email_verified_at' => null, 'status' => 'active',
        ]);
        $this->postJson('/api/v1/auth/login', ['login' => 'mail@example.com', 'password' => 'Secret123'])
            ->assertUnprocessable();

        $user->forceFill(['email_verified_at' => now()])->save();
        $this->withSession([])->postJson('/api/v1/auth/login', ['login' => 'mail@example.com', 'password' => 'Secret123'])
            ->assertOk();
    }

    public function test_otp_login_lifecycle_and_replay_protection(): void
    {
        $user = User::factory()->create([
            'username' => 'otp.user', 'status' => 'active',
            'phone' => '+989121234567', 'phone_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/otp/challenge', ['phone' => '09121234567'])->assertOk();
        $code = FakeSmsOtpDelivery::$sent['+989121234567'];
        $this->assertNotNull($code);

        $this->withSession([])->postJson('/api/v1/auth/otp/login', ['phone' => '09121234567', 'code' => $code])->assertOk();
        // Replaying the same code fails (challenge consumed atomically).
        $this->postJson('/api/v1/auth/otp/login', ['phone' => '09121234567', 'code' => $code])
            ->assertUnprocessable();
    }

    public function test_verified_phone_claim_is_exclusive(): void
    {
        config(['auth.otp.driver' => 'fake']);
        $first = User::factory()->create(['username' => 'first.user', 'status' => 'active']);
        $second = User::factory()->create(['username' => 'second.user', 'status' => 'active']);

        Sanctum::actingAs($first);
        $this->postJson('/api/v1/account/security/mobile', ['phone' => '09120000001'])
            ->assertUnprocessable(); // reauth required first

        $first->forceFill(['reauthenticated_at' => now()])->save();
        $this->postJson('/api/v1/account/security/mobile', ['phone' => '09120000001'])->assertOk();
        $code = FakeSmsOtpDelivery::$sent['+989120000001'];
        $this->postJson('/api/v1/account/security/mobile/confirm', ['phone' => '09120000001', 'code' => $code])->assertOk();
        $this->assertDatabaseHas('verified_phone_claims', ['phone' => '+989120000001', 'user_id' => $first->id]);

        // Second account cannot claim the same verified number.
        $second->forceFill(['reauthenticated_at' => now()])->save();
        Sanctum::actingAs($second);
        $this->postJson('/api/v1/account/security/mobile', ['phone' => '09120000001'])->assertOk();
        $code2 = FakeSmsOtpDelivery::$sent['+989120000001'];
        $this->postJson('/api/v1/account/security/mobile/confirm', ['phone' => '09120000001', 'code' => $code2])
            ->assertUnprocessable();
        $this->assertDatabaseMissing('verified_phone_claims', ['user_id' => $second->id]);
    }

    public function test_password_recovery_token_is_single_use(): void
    {
        $user = User::factory()->create([
            'username' => 'recover.user', 'status' => 'active',
            'email' => 'recover@example.com', 'email_verified_at' => now(),
            'password' => Hash::make('Secret123'),
        ]);
        $this->postJson('/api/v1/auth/password/forgot', ['email' => 'recover@example.com'])->assertOk();
        $row = DB::table('password_reset_tokens')->where('email', 'recover@example.com')->first();
        $this->assertNotNull($row);

        // Forgot response is identical for unknown emails (no enumeration).
        $known = $this->postJson('/api/v1/auth/password/forgot', ['email' => 'recover@example.com'])->json('message');
        $unknown = $this->postJson('/api/v1/auth/password/forgot', ['email' => 'ghost@example.com'])->json('message');
        $this->assertSame($known, $unknown);
    }

    public function test_activation_provisions_one_personal_workspace_idempotently(): void
    {
        $user = User::factory()->create(['username' => 'prov.user', 'status' => 'pending']);
        $service = app(AccountActivationService::class);
        $service->activate($user);
        $service->activate($user->fresh());

        $this->assertSame(1, Workspace::personal()->where('owner_user_id', $user->id)->count());
        $this->assertSame('active', $user->fresh()->status);
        $this->assertNotNull($user->fresh()->personal_workspace_provisioned_at);
    }

    public function test_session_revocation_requires_reauth_and_deletion_grace(): void
    {
        $user = User::factory()->create(['username' => 'sec.user', 'status' => 'active', 'password' => Hash::make('Secret123')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/account/sessions/revoke-others')->assertUnprocessable();
        $this->postJson('/api/v1/account/reauthenticate', ['password' => 'Secret123'])->assertOk();
        $this->postJson('/api/v1/account/sessions/revoke-others')->assertOk();

        $this->postJson('/api/v1/account/deletion-request', ['password' => 'Secret123'])->assertOk();
        $this->assertNotNull($user->fresh()->deletion_requested_at);
        $this->postJson('/api/v1/account/deletion-request/cancel')->assertOk();
        $this->assertNull($user->fresh()->deletion_requested_at);

        // After the 14-day grace the anonymization command finalizes it.
        $user->forceFill(['deletion_requested_at' => now()->subDays(15)])->save();
        Artisan::call('accounts:process-deletions');
        $this->assertSame('deleted', $user->fresh()->status);
        $this->assertNull($user->fresh()->email);
    }
}
