<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UsernameAccountsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    }

    private function account(string $role = 'team_member', array $attributes = []): User
    {
        return User::factory()->create([
            'role_id' => Role::where('key', $role)->firstOrFail()->id,
            'role_key' => $role,
            'status' => 'active',
            ...$attributes,
        ]);
    }

    private function registration(string $password = 'Test1234'): array
    {
        return ['name' => 'کاربر جدید', 'username' => 'new.account', 'password' => $password, 'password_confirmation' => $password];
    }

    public function test_registration_needs_no_email_and_accepts_eight_characters(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registration())
            ->assertCreated()->assertJsonMissingPath('data.email')->assertJsonPath('data.username', 'new.account');
        $user = User::where('username', 'new.account')->firstOrFail();
        $this->assertArrayNotHasKey('email', $user->getAttributes());
        $this->assertTrue(Hash::check('Test1234', $user->password));
        $this->assertSame('pending', $user->status);
    }

    public function test_registration_rejects_seven_characters_without_creating_an_account(): void
    {
        $this->postJson('/api/v1/auth/register', $this->registration('Test123'))
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_administrator_can_create_multiple_email_free_accounts(): void
    {
        Sanctum::actingAs($this->account('admin'));
        foreach (['first.account', 'second.account'] as $username) {
            $this->postJson('/api/v1/users', [...$this->registration(), 'username' => $username, 'role' => 'team_member'])
                ->assertCreated()->assertJsonMissingPath('data.email');
            $this->assertDatabaseHas('users', ['username' => $username]);
        }
    }

    public function test_administrator_creation_requires_a_valid_password(): void
    {
        Sanctum::actingAs($this->account('admin'));
        foreach ([null, 'Test123', str_repeat('ض', 36).'1'] as $password) {
            $data = ['name' => 'کاربر', 'username' => 'invalid.account', 'role' => 'team_member'];
            if ($password !== null) {
                $data += ['password' => $password, 'password_confirmation' => $password];
            }
            $this->postJson('/api/v1/users', $data)->assertUnprocessable()->assertJsonValidationErrors('password');
        }
        $this->assertDatabaseCount('users', 1);
    }

    public function test_only_an_authorized_administrator_can_reset_another_accounts_password(): void
    {
        $member = $this->account();
        $target = $this->account();
        $before = $target->password;
        $payload = ['password' => 'Reset123', 'password_confirmation' => 'Reset123'];
        Sanctum::actingAs($member);
        $this->patchJson('/api/v1/users/'.$target->id, $payload)->assertForbidden();
        $this->assertSame($before, $target->fresh()->password);
        Sanctum::actingAs($this->account('admin'));
        $this->patchJson('/api/v1/users/'.$target->id, $payload)->assertOk()->assertJsonMissingPath('data.email');
        $this->assertTrue(Hash::check('Reset123', $target->fresh()->password));
        $this->patchJson('/api/v1/users/'.$target->id, ['password' => 'Reset12', 'password_confirmation' => 'Reset12'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertTrue(Hash::check('Reset123', $target->fresh()->password));
    }

    public function test_email_is_not_returned_searchable_or_writable(): void
    {
        $user = $this->account('admin');
        $this->assertArrayNotHasKey('email', $user->toArray());
        $this->assertArrayNotHasKey('email_verified_at', $user->toArray());
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonMissingPath('data.email');
        $this->getJson('/api/v1/users?search=private-legacy-address')->assertOk()->assertJsonCount(0, 'data');
        $this->patchJson('/api/v1/users/'.$user->id, ['name' => 'نام جدید', 'email' => 'replacement@example.invalid'])
            ->assertOk()->assertJsonMissingPath('data.email')->assertJsonPath('data.name', 'نام جدید');
        $this->assertArrayNotHasKey('email', $user->fresh()->getAttributes());
    }

    public function test_login_uses_username_not_legacy_email(): void
    {
        $user = $this->account(attributes: ['username' => 'legacy.account', 'password' => 'Test1234']);
        $this->postJson('/api/v1/auth/login', ['login' => 'legacy@example.invalid', 'password' => 'Test1234'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['login' => $user->username, 'password' => 'Test1234'])
            ->assertOk()->assertJsonMissingPath('data.email');
    }

    public function test_public_email_recovery_endpoints_are_removed_and_send_nothing(): void
    {
        Mail::fake();
        Notification::fake();
        foreach (['forgot-password', 'reset-password'] as $path) {
            $this->postJson('/api/v1/auth/'.$path, ['email' => 'legacy@example.invalid', 'token' => 'old-token', ...$this->registration()])->assertNotFound();
        }
        Mail::assertNothingSent();
        Notification::assertNothingSent();
    }

    public function test_fresh_database_has_no_email_columns_or_reset_token_table(): void
    {
        $this->assertFalse(Schema::hasColumn('users', 'email'));
        $this->assertFalse(Schema::hasColumn('users', 'email_verified_at'));
        $this->assertFalse(Schema::hasTable('password_reset_tokens'));
        $this->assertNull(config('auth.passwords'));
    }

    public function test_legacy_email_settings_are_filtered_and_minimum_matches_validation(): void
    {
        Sanctum::actingAs($this->account('admin'));
        SystemSetting::create(['key' => 'notifications', 'value' => ['emailAlerts' => true, 'weeklyDigest' => true, 'mentionAlerts' => false]]);
        SystemSetting::create(['key' => 'security', 'value' => ['passwordMinLength' => 12]]);
        $this->getJson('/api/v1/settings')->assertOk()->assertJsonMissingPath('data.notifications.emailAlerts')
            ->assertJsonMissingPath('data.notifications.weeklyDigest')->assertJsonPath('data.notifications.mentionAlerts', false)
            ->assertJsonPath('data.security.passwordMinLength', 8);
        $this->putJson('/api/v1/settings/notifications', ['value' => ['emailAlerts' => true, 'mentionAlerts' => true]])
            ->assertOk()->assertJsonMissingPath('data.value.emailAlerts');
        $this->assertArrayNotHasKey('emailAlerts', SystemSetting::where('key', 'notifications')->firstOrFail()->value);
    }
}
