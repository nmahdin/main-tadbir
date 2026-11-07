<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * حالت تعمیر سامانه: تا وقتی روشن است فقط نقش «مدیریت کل سیستم» (`admin`)
 * می‌تواند وارد شود یا از API استفاده کند؛ بقیه — از جمله نشست‌های بازِ قبلی —
 * پاسخ ۵۰۳ با کد `maintenance_mode` می‌گیرند، نه خطای عمومی.
 */
class MaintenanceModeTest extends TestCase
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
            'password' => 'Test1234',
            ...$attributes,
        ]);
    }

    private function enableMaintenance(string $message = 'سامانه تا ساعت ۱۴ در حال به‌روزرسانی است.'): void
    {
        SystemSetting::query()->create([
            'key' => 'maintenance',
            'value' => ['enabled' => true, 'message' => $message],
        ]);
    }

    public function test_login_page_identity_reports_the_maintenance_state(): void
    {
        $this->getJson('/api/v1/public/identity')->assertOk()
            ->assertJsonPath('data.maintenance.enabled', false);

        $this->enableMaintenance();

        $this->getJson('/api/v1/public/identity')->assertOk()
            ->assertJsonPath('data.maintenance.enabled', true)
            ->assertJsonPath('data.maintenance.message', 'سامانه تا ساعت ۱۴ در حال به‌روزرسانی است.');
    }

    public function test_only_the_system_admin_can_log_in_during_maintenance(): void
    {
        $this->enableMaintenance();
        $member = $this->account('team_member');
        $admin = $this->account('admin');

        $this->postJson('/api/v1/auth/login', ['login' => $member->username, 'password' => 'Test1234'])
            ->assertStatus(503)
            ->assertJsonPath('code', 'maintenance_mode')
            ->assertJsonPath('data.maintenance.enabled', true);

        $this->assertGuest();

        $this->postJson('/api/v1/auth/login', ['login' => $admin->username, 'password' => 'Test1234'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');
    }

    public function test_maintenance_message_falls_back_to_a_readable_default(): void
    {
        SystemSetting::query()->create(['key' => 'maintenance', 'value' => ['enabled' => true, 'message' => '  ']]);
        $member = $this->account('team_member');

        $this->postJson('/api/v1/auth/login', ['login' => $member->username, 'password' => 'Test1234'])
            ->assertStatus(503)
            ->assertJsonPath('message', \App\Support\Maintenance\MaintenanceMode::DEFAULT_MESSAGE);
    }

    public function test_existing_non_admin_sessions_are_blocked_but_logout_stays_available(): void
    {
        $member = $this->account('team_member');
        Sanctum::actingAs($member);
        // پیش از روشن‌شدن حالت تعمیر، نشست معتبر است.
        $this->getJson('/api/v1/auth/me')->assertOk();

        $this->enableMaintenance();

        $this->getJson('/api/v1/auth/me')
            ->assertStatus(503)
            ->assertJsonPath('code', 'maintenance_mode');
        $this->getJson('/api/v1/tasks')->assertStatus(503);

        // کاربر مسدود باید بتواند نشست خود را ببندد؛ وگرنه برای همیشه قفل می‌ماند.
        $this->postJson('/api/v1/auth/logout')->assertOk();
    }

    public function test_system_admin_keeps_full_api_access_during_maintenance(): void
    {
        $this->enableMaintenance();
        Sanctum::actingAs($this->account('admin'));

        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.role', 'admin');
    }

    public function test_registration_is_closed_during_maintenance(): void
    {
        $this->enableMaintenance();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'کاربر جدید',
            'username' => 'closed.account',
            'password' => 'Test1234',
            'password_confirmation' => 'Test1234',
        ])->assertStatus(503)->assertJsonPath('code', 'maintenance_mode');

        $this->assertDatabaseMissing('users', ['username' => 'closed.account']);
    }

    public function test_only_the_system_admin_can_toggle_maintenance(): void
    {
        $manager = $this->account('team_member');
        // حتی با مجوز `settings.manage` هم این کلید در اختیار مدیر کل سیستم است.
        $permission = \App\Models\Permission::query()->firstOrCreate(
            ['key' => 'settings.manage'],
            ['label' => 'settings.manage', 'description' => 'settings.manage', 'category' => 'tests'],
        );
        $manager->role->permissions()->syncWithoutDetaching([$permission->id]);
        $manager->unsetRelation('role');
        Sanctum::actingAs($manager);

        $this->putJson('/api/v1/settings/maintenance', ['value' => ['enabled' => true]])
            ->assertForbidden();

        Sanctum::actingAs($this->account('admin'));

        $response = $this->putJson('/api/v1/settings/maintenance', [
            'value' => ['enabled' => true, 'message' => 'به‌روزرسانی پایگاه‌داده'],
        ])->assertOk();

        $response->assertJsonPath('data.value.enabled', true)
            ->assertJsonPath('data.value.message', 'به‌روزرسانی پایگاه‌داده');

        // مهر زمان و نام تغییردهنده را سرور تعیین می‌کند، نه کلاینت.
        $this->assertNotEmpty($response->json('data.value.startedAt'));
        $this->assertSame(
            SystemSetting::query()->where('key', 'maintenance')->value('value')['startedAt'],
            $response->json('data.value.startedAt'),
        );

        // خاموش‌کردن حالت تعمیر، مهر شروع را پاک می‌کند و کاربران عادی برمی‌گردند.
        $this->putJson('/api/v1/settings/maintenance', ['value' => ['enabled' => false]])
            ->assertOk()
            ->assertJsonPath('data.value.enabled', false)
            ->assertJsonPath('data.value.startedAt', null);

        Sanctum::actingAs($this->account('team_member'));
        $this->getJson('/api/v1/auth/me')->assertOk();
    }
}
