<?php

namespace Tests\Feature\Core;

use App\Core\Invitations\InvitationPresenter;
use App\Core\Invitations\InvitationService;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\CoreSettingValue;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingValueStore;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TempPresenterDebugTest extends TestCase
{
    use RefreshDatabase;

    public function test_debug_presenter_wiring(): void
    {
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        $registry = SettingsRegistry::withCoreDefinitions();
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);

        $manager = User::factory()->create(['username' => 'dbg_manager', 'status' => 'active']);
        $org = app(OrganizationProvisioner::class)->create($manager, 'Debug Org');
        $org->forceFill(['settings' => ['public' => ['description' => 'Legacy text']]])->save();

        $store = app(SettingValueStore::class);
        $store->put('organization', $org->id, 'organization.public.description', 'Canonical text');

        $presenter = app(InvitationPresenter::class);
        $reflection = new \ReflectionProperty($presenter, 'settings');
        $injected = $reflection->getValue($presenter);
        $direct = app(SettingValueStore::class)->get('organization', $org->id, 'organization.public.description');

        $role = app(RoleProvisioner::class)->organizationMember($org);
        $issued = app(InvitationService::class)->issueOrganizationInvitation($manager, $org->fresh(), 'dbg@example.com', $role->id);
        $presentation = $presenter->present($issued->invitation);

        $this->fail('DBG injected='.($injected === null ? 'null' : get_class($injected))
            .' rows='.CoreSettingValue::query()->count()
            .' directExists='.($direct->exists ? '1' : '0')
            .' directValue='.var_export($direct->value, true)
            .' orgId='.$org->id
            .' presented='.var_export($presentation->organization['description'] ?? 'NOKEY', true));
    }
}
