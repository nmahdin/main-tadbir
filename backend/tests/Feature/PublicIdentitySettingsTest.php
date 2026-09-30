<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicIdentitySettingsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_public_login_identity_requires_no_authentication_and_discloses_only_visual_values(): void
    {
        SystemSetting::query()->create([
            'key' => 'general',
            'value' => [
                'orgName' => 'سازمان نمونه',
                'workspaceSlug' => 'private-workspace',
                'loginDescription' => 'خوش آمدید؛ برای ادامه وارد شوید.',
                'themeColor' => '#4338ca',
                'security' => ['sessionLifetimeMinutes' => 480],
            ],
        ]);

        $this->getJson('/api/v1/public/identity')->assertOk()
            ->assertJsonPath('data.orgName', 'سازمان نمونه')
            ->assertJsonPath('data.loginDescription', 'خوش آمدید؛ برای ادامه وارد شوید.')
            ->assertJsonPath('data.themeColor', '#4338ca')
            ->assertJsonMissingPath('data.workspaceSlug')
            ->assertJsonMissingPath('data.security');
    }

    public function test_public_login_identity_has_safe_defaults(): void
    {
        $this->getJson('/api/v1/public/identity')->assertOk()
            ->assertJsonPath('data.loginDescription', '')
            ->assertJsonPath('data.themeColor', '#4f46e5');
    }
}
