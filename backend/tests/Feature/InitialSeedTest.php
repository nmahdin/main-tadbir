<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PublishingPlatformSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class InitialSeedTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['mahdi', 'emad', 'amirali'] as $key) {
            config()->set('seed_users.'.$key.'.password', 'Test-only-'.$key.'-password!');
        }
    }

    public function test_fresh_seed_contains_only_requested_people_and_required_access_data(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->assertDatabaseCount('users', 3);
        $this->assertDatabaseCount('roles', 2);
        $this->assertDatabaseCount('permissions', count(PermissionSeeder::PERMISSIONS));
        foreach (['departments', 'projects', 'tasks', 'project_templates', 'domain_records'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $platforms = SystemSetting::where('key', 'publishing_platforms')->firstOrFail()->value;
        $this->assertCount(count(PublishingPlatformSeeder::PLATFORMS), $platforms);
        $this->assertSame(
            ['website', 'instagram', 'telegram', 'bale', 'eitaa', 'rubika', 'aparat', 'youtube', 'linkedin', 'x'],
            array_column($platforms, 'id'),
        );
        $expected = [
            'mahdi.nabavi' => ['مهدی نبوی', 'admin', 'mahdi'],
            'emad.hendi' => ['عماد هندی', 'team_member', 'emad'],
            'amirali.shirazi' => ['امیرعلی شیرازی', 'team_member', 'amirali'],
        ];
        foreach ($expected as $username => [$name, $role, $config]) {
            $user = User::where('username', $username)->firstOrFail();
            $this->assertSame($name, $user->name);
            $this->assertSame($role, $user->role->key);
            $this->assertSame('active', $user->status);
            $this->assertTrue(Hash::check(config('seed_users.'.$config.'.password'), $user->password));
            $this->assertFalse(Hash::check('password', $user->password));
            $this->assertNull($user->last_login_at);
            $this->assertArrayNotHasKey('email', $user->getAttributes());
            $this->assertArrayNotHasKey('email_verified_at', $user->getAttributes());
            $this->assertNull($user->department_id);
            $this->assertNull($user->phone);
            $this->assertNull($user->avatar);
            if ($role === 'admin') {
                $this->assertTrue($user->isAdmin());
                $this->assertCount(count(PermissionSeeder::PERMISSIONS), $user->permissionKeys());
            } else {
                $this->assertFalse($user->isAdmin());
                $this->assertSame(['tasks.view'], $user->permissionKeys());
            }
        }
    }

    public function test_reseed_preserves_existing_accounts_passwords_roles_and_business_data(): void
    {
        $this->seed(DatabaseSeeder::class);
        $member = User::where('username', 'emad.hendi')->firstOrFail();
        $member->update(['name' => 'نام ویرایش‌شده', 'password' => 'Changed-private-password!', 'status' => 'blocked']);
        $role = $member->role;
        $role->update(['name' => 'نقش سفارشی', 'is_active' => false]);
        $role->permissions()->detach();
        $other = User::factory()->create();
        $project = Project::create(['name' => 'پروژه واقعی', 'status' => 'active']);
        $customPlatforms = [['id' => 'custom-channel', 'name' => 'کانال سفارشی']];
        SystemSetting::where('key', 'publishing_platforms')->firstOrFail()->update(['value' => $customPlatforms]);
        $before = $member->fresh()->getAttributes();
        foreach (['mahdi', 'emad', 'amirali'] as $key) {
            config()->set('seed_users.'.$key.'.password', null);
        }
        $this->seed(DatabaseSeeder::class);
        $this->assertDatabaseCount('users', 4);
        $this->assertSame($before, $member->fresh()->getAttributes());
        $this->assertTrue(Hash::check('Changed-private-password!', $member->fresh()->password));
        $this->assertFalse($role->fresh()->is_active);
        $this->assertSame('نقش سفارشی', $role->fresh()->name);
        $this->assertCount(0, $role->fresh()->permissions);
        $this->assertNotNull($other->fresh());
        $this->assertSame('پروژه واقعی', $project->fresh()->name);
        $this->assertSame($customPlatforms, SystemSetting::where('key', 'publishing_platforms')->firstOrFail()->value);
    }

    public function test_missing_or_weak_password_rolls_back_the_entire_seed_without_echoing_it(): void
    {
        foreach ([null, 'Short12', str_repeat('a', 73)] as $password) {
            config()->set('seed_users.amirali.password', $password);
            try {
                $this->seed(DatabaseSeeder::class);
                $this->fail('Unsafe seed should fail.');
            } catch (RuntimeException $exception) {
                $this->assertStringContainsString('amirali.shirazi', $exception->getMessage());
                $this->assertStringContainsString('SEED_AMIRALI_PASSWORD', $exception->getMessage());
                $this->assertStringContainsString('php artisan config:clear', $exception->getMessage());
                $this->assertStringContainsString('php artisan db:seed', $exception->getMessage());
                if ($password !== null) {
                    $this->assertStringNotContainsString($password, $exception->getMessage());
                }
            }
            $this->assertDatabaseCount('users', 0);
            $this->assertDatabaseCount('roles', 0);
            $this->assertDatabaseCount('permissions', 0);
        }
    }

    public function test_seed_does_not_read_legacy_email_or_take_over_existing_accounts(): void
    {
        $existing = User::factory()->create(['username' => 'existing.account']);
        $before = $existing->fresh()->getAttributes();
        config()->set('seed_users.emad.email', 'emad.hendi@users.invalid');
        $this->seed(DatabaseSeeder::class);
        $this->assertDatabaseCount('users', 4);
        $this->assertSame($before, $existing->fresh()->getAttributes());
        $this->assertArrayNotHasKey('email', User::where('username', 'emad.hendi')->firstOrFail()->getAttributes());
    }

    public function test_seed_will_not_reactivate_an_existing_disabled_admin_role(): void
    {
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        $role = Role::where('key', 'admin')->firstOrFail();
        $role->update(['is_active' => false]);
        try {
            $this->seed(DatabaseSeeder::class);
            $this->fail('Disabled admin role should require explicit operator action.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('نقش فعال', $exception->getMessage());
        }
        $this->assertFalse($role->fresh()->is_active);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_seeded_users_can_authenticate_but_only_mahdi_can_administer_roles(): void
    {
        $this->seed(DatabaseSeeder::class);
        foreach (['mahdi.nabavi' => 'mahdi', 'emad.hendi' => 'emad', 'amirali.shirazi' => 'amirali'] as $username => $key) {
            $this->postJson('/api/v1/auth/login', ['login' => $username, 'password' => config('seed_users.'.$key.'.password')])->assertOk();
            $user = User::where('username', $username)->firstOrFail();
            Sanctum::actingAs($user);
            $this->getJson('/api/v1/roles')->assertStatus($key === 'mahdi' ? 200 : 403);
        }
    }

    public function test_eight_character_passwords_are_accepted_without_any_email_configuration(): void
    {
        foreach (['mahdi', 'emad', 'amirali'] as $key) {
            config()->set('seed_users.'.$key, ['password' => 'Seed1234']);
        }
        $this->seed(DatabaseSeeder::class);
        foreach (User::all() as $user) {
            $this->assertArrayNotHasKey('email', $user->getAttributes());
            $this->assertTrue(Hash::check('Seed1234', $user->password));
        }
    }

    public function test_multibyte_password_limit_is_in_bytes_and_the_exact_limit_is_accepted(): void
    {
        $tooLong = str_repeat('ض', 37);
        config()->set('seed_users.mahdi.password', $tooLong);
        try {
            $this->seed(DatabaseSeeder::class);
            $this->fail('A 74-byte password should fail before hashing.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('SEED_MAHDI_PASSWORD', $exception->getMessage());
            $this->assertStringContainsString('۷۲ بایت', $exception->getMessage());
            $this->assertStringNotContainsString($tooLong, $exception->getMessage());
        }
        $this->assertDatabaseCount('users', 0);
        $accepted = str_repeat('ض', 36);
        config()->set('seed_users.mahdi.password', $accepted);
        $this->seed(DatabaseSeeder::class);
        $this->assertTrue(Hash::check($accepted, User::where('username', 'mahdi.nabavi')->firstOrFail()->password));
    }
}
