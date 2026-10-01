<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhaseFourFoundationTest extends TestCase
{
    use RefreshDatabase;

    private int $roleSequence = 0;

    private function actor(array $permissions): User
    {
        $this->roleSequence++;
        $role = Role::create([
            'key' => 'phase4-'.$this->roleSequence,
            'name' => 'Phase 4',
            'is_active' => true,
        ]);
        foreach ($permissions as $key) {
            $permission = Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            );
            $role->permissions()->attach($permission);
        }
        $user = User::factory()->create([
            'status' => 'active',
            'role_id' => $role->id,
            'role_key' => $role->key,
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_regular_users_receive_runtime_configuration_but_not_administrative_policy(): void
    {
        $this->actor(['projects.view']);
        SystemSetting::create(['key' => 'security', 'value' => ['maxLoginAttempts' => 2]]);
        SystemSetting::create(['key' => 'notifications', 'value' => ['deadlineReminders' => false]]);

        $this->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.general.orgName', 'سامانه سازمانی تدبیر')
            ->assertJsonMissingPath('data.security')
            ->assertJsonMissingPath('data.notifications');
        $this->getJson('/api/v1/settings/security')->assertForbidden();
        $this->putJson('/api/v1/settings/security', ['value' => ['maxLoginAttempts' => 3]])->assertForbidden();
    }

    public function test_setting_manager_updates_a_validated_schema_and_writes_a_value_free_audit(): void
    {
        $actor = $this->actor(['settings.manage']);
        $secretMarker = 'نام سازمان غیرقابل ثبت در لاگ';

        $this->putJson('/api/v1/settings/general', ['value' => [
            'orgName' => $secretMarker,
            'workspaceSlug' => 'phase-four',
            'calendar' => 'jalali',
        ]])->assertOk()
            ->assertJsonPath('data.value.orgName', $secretMarker)
            ->assertJsonPath('data.value.timezone', 'Asia/Tehran');

        $this->assertDatabaseHas('system_settings', ['key' => 'general', 'updated_by' => $actor->id]);
        $audit = ActivityLog::query()->where('type', 'organization_setting_updated')->firstOrFail();
        $this->assertSame($actor->id, $audit->user_id);
        $this->assertStringContainsString('setting:general', $audit->details);
        $this->assertStringNotContainsString($secretMarker, $audit->details);
    }

    public function test_unknown_fields_and_non_operational_status_ids_are_rejected(): void
    {
        $this->actor(['settings.manage']);

        $this->putJson('/api/v1/settings/general', ['value' => [
            'orgName' => 'معتبر',
            'queueDriver' => 'redis',
        ]])->assertUnprocessable();
        $this->putJson('/api/v1/settings/task_statuses', ['value' => [[
            'id' => 'invented_transition',
            'label' => 'وضعیت ساختگی',
            'color' => '#112233',
            'order' => 1,
        ]]])->assertUnprocessable();

        $this->assertDatabaseMissing('system_settings', ['key' => 'general']);
        $this->assertDatabaseMissing('activity_logs', ['type' => 'organization_setting_updated']);
    }

    public function test_content_editor_is_limited_to_the_existing_delegated_keys(): void
    {
        $this->actor(['content.edit']);

        $this->putJson('/api/v1/settings/process_templates', ['value' => []])->assertOk();
        $this->putJson('/api/v1/settings/general', ['value' => ['orgName' => 'غیرمجاز']])->assertForbidden();
        $this->getJson('/api/v1/settings/security')->assertForbidden();
    }
}
