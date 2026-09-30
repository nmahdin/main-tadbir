<?php

namespace Tests\Feature\Bale;

use App\Models\BaleUserLink;
use App\Models\User;
use App\Services\BaleAuthChallenge;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BaleAuthChallengeTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_issue_response_does_not_reveal_account_or_link_state_and_is_rate_limited(): void
    {
        $unknown = $this->postJson('/api/v1/auth/bale/code', ['login' => 'missing-user', 'purpose' => 'login'])
            ->assertAccepted()->assertJsonMissing(['code']);
        $user = User::factory()->create(['username' => 'unlinked-user', 'status' => 'active']);
        $unlinked = $this->postJson('/api/v1/auth/bale/code', ['login' => $user->username, 'purpose' => 'login'])
            ->assertAccepted()->assertJsonMissing(['code']);
        $this->assertSame($unknown->json('message'), $unlinked->json('message'));

        $this->postJson('/api/v1/auth/bale/code', ['login' => 'limited-user', 'purpose' => 'login'])->assertAccepted();
        $this->postJson('/api/v1/auth/bale/code', ['login' => 'limited-user', 'purpose' => 'login'])->assertAccepted();
        $this->postJson('/api/v1/auth/bale/code', ['login' => 'limited-user', 'purpose' => 'login'])->assertAccepted();
        $this->postJson('/api/v1/auth/bale/code', ['login' => 'limited-user', 'purpose' => 'login'])->assertUnprocessable();
    }

    public function test_login_code_is_expiring_single_use_and_creates_server_session(): void
    {
        $user = $this->linkedUser('bale-login');
        $this->challenge($user, BaleAuthChallenge::LOGIN, '123456');

        $this->postJson('/api/v1/auth/bale/login', ['login' => $user->username, 'code' => '123456', 'remember' => true])
            ->assertOk()->assertJsonPath('data.id', (string) $user->id)->assertJsonMissing(['token']);
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseMissing('bale_auth_challenges', ['user_id' => $user->id, 'purpose' => BaleAuthChallenge::LOGIN]);

        $this->postJson('/api/v1/auth/bale/login', ['login' => $user->username, 'code' => '123456'])
            ->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->challenge($user, BaleAuthChallenge::LOGIN, '654321', now()->subSecond());
        $this->postJson('/api/v1/auth/bale/login', ['login' => $user->username, 'code' => '654321'])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
    }

    public function test_invalid_code_increments_attempts_without_disclosing_secrets(): void
    {
        $user = $this->linkedUser('bale-wrong');
        $this->challenge($user, BaleAuthChallenge::LOGIN, '123456');

        $this->postJson('/api/v1/auth/bale/login', ['login' => $user->username, 'code' => '111111'])
            ->assertUnprocessable()->assertJsonValidationErrors('code')->assertJsonMissing(['code_hash', 'chat_id']);
        $this->assertDatabaseHas('bale_auth_challenges', ['user_id' => $user->id, 'attempts' => 1]);
    }

    public function test_password_reset_rotates_password_tokens_and_consumes_challenge(): void
    {
        $user = $this->linkedUser('bale-reset');
        $user->createToken('old-device');
        $this->challenge($user, BaleAuthChallenge::PASSWORD_RESET, '234567');

        $this->postJson('/api/v1/auth/bale/password/reset', [
            'login' => $user->username, 'code' => '234567',
            'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password',
        ])->assertOk()->assertJsonMissing(['token', 'user']);

        $user->refresh();
        $this->assertTrue(Hash::check('new-secure-password', $user->password));
        $this->assertNotNull($user->remember_token);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseMissing('bale_auth_challenges', ['user_id' => $user->id, 'purpose' => BaleAuthChallenge::PASSWORD_RESET]);
        $this->assertDatabaseHas('activity_logs', ['user_id' => $user->id, 'type' => 'auth_password_reset']);
    }

    private function linkedUser(string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        BaleUserLink::create(['user_id' => $user->id, 'bale_user_id' => (string) (900000 + $user->id), 'chat_id' => (string) (800000 + $user->id)]);

        return $user;
    }

    private function challenge(User $user, string $purpose, string $code, $expiresAt = null): void
    {
        DB::table('bale_auth_challenges')->updateOrInsert(['user_id' => $user->id, 'purpose' => $purpose], [
            'code_hash' => hash_hmac('sha256', $user->id.'|'.$purpose.'|'.$code, (string) config('app.key')),
            'attempts' => 0, 'expires_at' => $expiresAt ?? now()->addMinutes(5), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
