<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Settings\CoreSettingSecret;
use App\Core\Settings\Services\ScopedSecretService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValueStore;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C7-3 — scoped secrets: separate permissions, encrypted
 * storage, metadata-only reads, internal consumption, lifecycle
 * and module gates, version conflicts, audit integrity.
 */
class ScopedSettingsSecretsTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $workspace;

    private ScopedSecretService $secrets;

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
        $this->secrets = app(ScopedSecretService::class);

        $this->manager = User::factory()->create(['username' => 'sec_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Secrets Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_secret_permissions_are_not_granted_by_protected_role_provisioning(): void
    {
        // The organization manager (fresh from provisioning) holds
        // settings.manage but NOT the separately-provisioned key.
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->secrets->putOrganizationSecret($this->manager, $this->org, 'integrations.demo.api_key', 'alpha-one'));
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->secrets->organizationSecretMetadata($this->manager, $this->org, 'integrations.demo.api_key'));

        // Explicit separate provisioning grants exactly that scope.
        $admin = $this->grantOrganizationSecrets($this->manager);
        $metadata = $this->secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'alpha-one', expectedVersion: 0);
        $this->assertTrue($metadata['configured']);
        $this->assertSame(1, $metadata['version']);
    }

    public function test_secret_lifecycle_versions_conflicts_and_metadata_only_reads(): void
    {
        $admin = $this->grantOrganizationSecrets($this->manager);

        $this->secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'first-secret-value');
        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'other', expectedVersion: 0));

        $metadata = $this->secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'second-secret-value', expectedVersion: 1);
        $this->assertSame(2, $metadata['version']);
        $this->assertSame('2026-06-01T12:00:00+00:00', $metadata['updated_at']);
        $this->assertSame(['configured', 'version', 'updated_at'], array_keys($metadata), 'metadata exposes nothing else');

        // Internal consumption is the only plaintext path.
        $this->assertSame('second-secret-value', $this->secrets->consumeForOrganization($this->org, 'integrations.demo.api_key'));

        // Storage contains ciphertext only; audits carry no values.
        $row = CoreSettingSecret::query()->sole();
        $this->assertStringNotContainsString('second-secret-value', (string) $row->ciphertext);
        $this->assertStringNotContainsString('second-secret-value', (string) json_encode(AuditLog::query()->pluck('summary')));
        $this->assertStringNotContainsString('second-secret-value', $row->toJson(), 'model serialization hides ciphertext');

        $this->secrets->revokeOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', expectedVersion: 2);
        $this->assertNull($this->secrets->consumeForOrganization($this->org, 'integrations.demo.api_key'));
        $this->assertFalse($this->secrets->organizationSecretMetadata($admin, $this->org, 'integrations.demo.api_key')['configured']);

        // The generic settings path still refuses secrets entirely.
        $this->assertSame(0, DB::table('core_setting_values')->where('setting_key', 'integrations.demo.api_key')->count());
        try {
            app(SettingValueStore::class)->put('organization', $this->org->id, 'integrations.demo.api_key', 'leak');
            $this->fail('generic store must refuse secrets');
        } catch (\App\Core\Settings\SettingValidationException $exception) {
            $this->assertSame('setting_secret_not_storable', $exception->errorCode);
        }
    }

    public function test_workspace_secret_isolation_module_state_and_lifecycle(): void
    {
        $wsAdmin = $this->grantWorkspaceSecrets($this->manager, $this->workspace);

        // Organization secrets authority does NOT cross scopes:
        // a separately-granted ORG admin without workspace grant fails.
        $orgOnly = $this->grantOrganizationSecrets(User::factory()->create(['username' => 'sec_orgonly', 'status' => 'active']));
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->secrets->putWorkspaceSecret($orgOnly, $this->workspace, 'projects.integration.token', 'tok'));

        // Disabled module: writes and consumption are denied.
        $this->assertServiceFails('setting_module_disabled',
            fn () => $this->secrets->putWorkspaceSecret($wsAdmin, $this->workspace, 'projects.integration.token', 'tok-1'));

        $projects = CoreModule::query()->where('key', 'projects')->firstOrFail();
        WorkspaceModule::query()->create([
            'workspace_id' => $this->workspace->id, 'module_id' => $projects->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
        ]);
        $this->secrets->putWorkspaceSecret($wsAdmin, $this->workspace, 'projects.integration.token', 'tok-1');
        $this->assertSame('tok-1', $this->secrets->consumeForWorkspace($this->workspace, 'projects.integration.token'));

        // Disabling the module makes the stored secret unusable.
        WorkspaceModule::query()->where('workspace_id', $this->workspace->id)->update(['status' => WorkspaceModule::STATUS_DISABLED]);
        $this->assertServiceFails('setting_module_disabled',
            fn () => $this->secrets->consumeForWorkspace($this->workspace, 'projects.integration.token'));
        $this->assertSame(1, CoreSettingSecret::query()->count(), 'the row is preserved, only unusable');

        // Suspended organization: mutations and consumption denied.
        WorkspaceModule::query()->where('workspace_id', $this->workspace->id)->update(['status' => WorkspaceModule::STATUS_ENABLED]);
        $this->org->forceFill(['status' => 'suspended'])->save();
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->secrets->putWorkspaceSecret($wsAdmin, $this->workspace->fresh(), 'projects.integration.token', 'tok-2'));
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->secrets->consumeForWorkspace($this->workspace->fresh(), 'projects.integration.token'));
    }

    public function test_audit_failure_rolls_back_secret_mutation(): void
    {
        $admin = $this->grantOrganizationSecrets($this->manager);

        AuditLog::creating(function (): void {
            throw new \RuntimeException('simulated audit failure');
        });

        try {
            $this->secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'never-stored');
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(0, CoreSettingSecret::query()->count());
    }

    public function test_platform_and_legacy_admins_get_no_implicit_secret_access(): void
    {
        $legacyAdmin = User::factory()->create(['username' => 'sec_legacy_admin', 'status' => 'active', 'role_key' => 'admin']);
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->secrets->putOrganizationSecret($legacyAdmin, $this->org, 'integrations.demo.api_key', 'x'));
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->secrets->putWorkspaceSecret($legacyAdmin, $this->workspace, 'projects.integration.token', 'x'));
    }

    private function grantOrganizationMembership(User $user): void
    {
        $memberRole = app(RoleProvisioner::class)->organizationMember($this->org);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'role_id' => $memberRole->id, 'status' => MembershipStatus::Active]);
    }

    private function grantOrganizationSecrets(User $user): User
    {
        // The separate provisioning act (C7-3): a dedicated role
        // carrying ONLY the secrets key, assigned explicitly.
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

    private function grantWorkspaceSecrets(User $user, Workspace $workspace): User
    {
        $permission = ScopedPermission::query()->where('key', 'workspace.settings.secrets.manage')->firstOrFail();
        $role = ScopedRole::query()->firstOrCreate(
            ['scope' => 'workspace', 'workspace_id' => $workspace->id, 'key' => 'secret_administrators'],
            ['name' => 'Secret Administrators'],
        );
        $role->permissions()->sync([$permission->id]);
        $existing = WorkspaceMembership::query()->where('workspace_id', $workspace->id)->where('user_id', $user->id)->first();
        if ($existing === null) {
            WorkspaceMembership::create(['workspace_id' => $workspace->id, 'user_id' => $user->id, 'role_id' => $role->id, 'status' => MembershipStatus::Active]);
        } else {
            $existing->forceFill(['role_id' => $role->id])->save();
        }

        return $user;
    }

    private function assertServiceFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected SettingServiceException [{$code}]");
        } catch (SettingServiceException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
