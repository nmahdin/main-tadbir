<?php

namespace Tests\Feature\Core;

use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Settings\CoreSettingSecret;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C7-4 — secrets HTTP surface: metadata-only, write-only,
 * permission-separated. Two clearly-fictional definitions are
 * registered for the test container only (the same C7-3 pattern);
 * production Core registers no secret keys until a real consumer
 * module declares one.
 */
class ScopedSettingsSecretsApiTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();

        $registry = SettingsRegistry::withCoreDefinitions();
        $registry->register(new SettingDefinition(
            'integrations.demo.api_key', 'Demo API key', SettingDefinition::TYPE_STRING, null,
            [SettingDefinition::SCOPE_ORGANIZATION], nullable: true, sensitivity: 'secret',
        ));
        $registry->register(new SettingDefinition(
            'projects.integration.token', 'Projects integration token', SettingDefinition::TYPE_STRING, null,
            [SettingDefinition::SCOPE_WORKSPACE], owner: 'projects', nullable: true, sensitivity: 'secret',
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);
        app(ModuleRegistrySynchronizer::class)->sync();

        $this->manager = User::factory()->create(['username' => 'sec_api_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Secrets API Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_settings_manager_without_secrets_permission_is_denied(): void
    {
        Sanctum::actingAs($this->manager);
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/secrets")
            ->assertForbidden()->assertJsonPath('code', 'setting_forbidden');
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/secrets/integrations.demo.api_key", ['value' => 'x'])
            ->assertForbidden();
        // Secret keys are absent from the ordinary settings surface too.
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings")->assertOk();
        $this->assertNotContains('integrations.demo.api_key', array_map(fn (array $entry) => $entry['definition']['key'], $list->json('data')));
    }

    public function test_organization_secret_write_replace_revoke_is_metadata_only(): void
    {
        $admin = $this->grantOrganizationSecrets($this->manager);
        Sanctum::actingAs($admin);
        $url = "/api/v1/core/organizations/{$this->org->id}/secrets/integrations.demo.api_key";

        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/secrets")->assertOk();
        $this->assertSame('integrations.demo.api_key', $list->json('data.0.definition.key'));
        $this->assertFalse($list->json('data.0.secret.configured'));

        $put = $this->putJson($url, ['value' => 'fictional-secret-alpha', 'expected_version' => 0])->assertOk();
        $put->assertJsonPath('data.secret.configured', true)->assertJsonPath('data.secret.version', 1);
        $this->assertStringNotContainsString('fictional-secret-alpha', $put->getContent());

        // Ciphertext is nowhere in any response either.
        $row = CoreSettingSecret::query()->sole();
        $this->assertStringNotContainsString((string) $row->ciphertext, $put->getContent());
        $this->assertStringNotContainsString('ciphertext', $put->getContent());

        $this->putJson($url, ['value' => 'fictional-secret-beta', 'expected_version' => 0])
            ->assertStatus(409)->assertJsonPath('code', 'setting_version_conflict');
        $this->putJson($url, ['value' => 'fictional-secret-beta', 'expected_version' => 1])
            ->assertOk()->assertJsonPath('data.secret.version', 2);

        $this->deleteJson($url, ['expected_version' => 2])->assertOk()
            ->assertJsonPath('data.secret.configured', false);
        $this->assertSame(0, CoreSettingSecret::query()->count());

        // Secret keys have no readable history surface.
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/settings/integrations.demo.api_key/history")
            ->assertStatus(404)->assertJsonPath('code', 'setting_history_unavailable');
    }

    public function test_organization_and_workspace_secret_permissions_are_independent(): void
    {
        $projects = CoreModule::query()->where('key', 'projects')->firstOrFail();
        WorkspaceModule::query()->create([
            'workspace_id' => $this->workspace->id, 'module_id' => $projects->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
        ]);

        // Organization-secrets administrator: organization only.
        $orgAdmin = $this->grantOrganizationSecrets(User::factory()->create(['username' => 'sec_api_orgonly', 'status' => 'active']));
        Sanctum::actingAs($orgAdmin);
        $this->putJson("/api/v1/core/organizations/{$this->org->id}/secrets/integrations.demo.api_key", ['value' => 'org-level-secret'])->assertOk();
        $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/secrets")
            ->assertForbidden()->assertJsonPath('code', 'setting_forbidden');
        $this->putJson("/api/v1/core/workspaces/{$this->workspace->id}/secrets/projects.integration.token", ['value' => 'nope'])
            ->assertForbidden();

        // Workspace-secrets administrator: workspace only, and the
        // two scopes hold fully independent values.
        $wsAdmin = $this->grantWorkspaceSecrets(User::factory()->create(['username' => 'sec_api_wsonly', 'status' => 'active']));
        Auth::forgetGuards();
        Sanctum::actingAs($wsAdmin);
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/secrets")->assertForbidden();
        $this->putJson("/api/v1/core/workspaces/{$this->workspace->id}/secrets/projects.integration.token", ['value' => 'workspace-level-secret'])
            ->assertOk()->assertJsonPath('data.secret.version', 1);
        $list = $this->getJson("/api/v1/core/workspaces/{$this->workspace->id}/secrets")->assertOk();
        $this->assertStringNotContainsString('org-level-secret', $list->getContent());
        $this->assertStringNotContainsString('workspace-level-secret', $list->getContent());
        $this->assertSame(2, CoreSettingSecret::query()->count(), 'one row per scope, independently stored');
    }

    public function test_secret_write_requires_a_string_value_and_never_echoes_it(): void
    {
        $admin = $this->grantOrganizationSecrets($this->manager);
        Sanctum::actingAs($admin);
        $url = "/api/v1/core/organizations/{$this->org->id}/secrets/integrations.demo.api_key";

        $this->putJson($url, [])->assertStatus(422)->assertJsonPath('code', 'setting_secret_value_required');
        $bad = $this->putJson($url, ['value' => ['nested' => 'must-not-echo']])->assertStatus(422);
        $this->assertStringNotContainsString('must-not-echo', $bad->getContent());
        $this->assertSame(0, CoreSettingSecret::query()->count());
    }

    private function grantOrganizationSecrets(User $user): User
    {
        $permission = ScopedPermission::query()->where('key', 'organization.settings.secrets.manage')->firstOrFail();
        $role = ScopedRole::query()->firstOrCreate(
            ['scope' => 'organization', 'organization_id' => $this->org->id, 'key' => 'secret_administrators'],
            ['name' => 'Secret Administrators'],
        );
        $role->permissions()->sync([$permission->id]);
        $existing = OrganizationMembership::query()->where('organization_id', $this->org->id)->where('user_id', $user->id)->first();
        if ($existing === null) {
            OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'role_id' => $role->id, 'status' => MembershipStatus::Active]);
        } else {
            $existing->forceFill(['role_id' => $role->id])->save();
        }

        return $user;
    }

    private function grantWorkspaceSecrets(User $user): User
    {
        $permission = ScopedPermission::query()->where('key', 'workspace.settings.secrets.manage')->firstOrFail();
        $role = ScopedRole::query()->firstOrCreate(
            ['scope' => 'workspace', 'workspace_id' => $this->workspace->id, 'key' => 'secret_administrators'],
            ['name' => 'Secret Administrators'],
        );
        $role->permissions()->sync([$permission->id]);
        $existing = WorkspaceMembership::query()->where('workspace_id', $this->workspace->id)->where('user_id', $user->id)->first();
        if ($existing === null) {
            WorkspaceMembership::create(['workspace_id' => $this->workspace->id, 'user_id' => $user->id, 'role_id' => $role->id, 'status' => MembershipStatus::Active]);
        } else {
            $existing->forceFill(['role_id' => $role->id])->save();
        }

        return $user;
    }
}
