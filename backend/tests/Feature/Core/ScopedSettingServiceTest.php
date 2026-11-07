<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Invitations\InvitationPresenter;
use App\Core\Invitations\InvitationService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\CoreSettingValue;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValidationException;
use App\Core\Settings\SettingValueStore;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C7-2 — authorized settings mutations: scoped permissions,
 * lifecycle, override policies, versions, module-state denial,
 * secret rejection, audit integrity.
 */
class ScopedSettingServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $workspace;

    private ScopedSettingService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();

        $registry = SettingsRegistry::withCoreDefinitions();
        $registry->register(new SettingDefinition(
            'workspace.display.density', 'Density', SettingDefinition::TYPE_ENUM, 'comfortable',
            [SettingDefinition::SCOPE_ORGANIZATION, SettingDefinition::SCOPE_WORKSPACE],
            constraints: ['values' => ['comfortable', 'compact']],
            inheritance: SettingDefinition::INHERITANCE_ORGANIZATION_TO_WORKSPACE,
            workspaceOverride: true,
        ));
        $registry->register(new SettingDefinition(
            'core.integrations.api_token', 'API token', SettingDefinition::TYPE_STRING, null,
            [SettingDefinition::SCOPE_ORGANIZATION], nullable: true, sensitivity: 'secret',
        ));
        $registry->register(new SettingDefinition(
            'projects.workspace.default_view', 'Default view', SettingDefinition::TYPE_ENUM, 'list',
            [SettingDefinition::SCOPE_WORKSPACE], owner: 'projects',
            constraints: ['values' => ['list', 'board']],
            workspaceOverride: true,
        ));
        $registry->register(new SettingDefinition(
            'tasks.organization.default_priority', 'Default priority', SettingDefinition::TYPE_ENUM, 'normal',
            [SettingDefinition::SCOPE_ORGANIZATION], owner: 'tasks',
            constraints: ['values' => ['low', 'normal', 'high']],
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);
        $this->service = app(ScopedSettingService::class);

        $this->manager = User::factory()->create(['username' => 'svc_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Service Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_authorized_organization_write_with_versions_and_safe_audit(): void
    {
        $written = $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact', expectedVersion: 0);
        $this->assertSame(1, $written->version);

        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 0));

        $second = $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 1);
        $this->assertSame(2, $second->version);

        // Immediate inheritance: the workspace resolves the new org value.
        $effective = $this->service->effectiveFor($this->manager, 'workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('comfortable', $effective['value']);

        $audit = AuditLog::query()->where('action', 'setting.value_written')->latest('id')->firstOrFail();
        $this->assertSame('workspace.display.density', $audit->summary['setting_key']);
        $this->assertSame(2, $audit->summary['version']);
        $this->assertStringNotContainsString('comfortable', (string) json_encode($audit->summary), 'values are never audited');
    }

    public function test_unauthorized_actors_are_denied_in_every_scope(): void
    {
        $memberRole = app(RoleProvisioner::class)->organizationMember($this->org);
        $member = User::factory()->create(['username' => 'svc_member', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $member->id, 'role_id' => $memberRole->id, 'status' => MembershipStatus::Active]);

        // Plain member (view-only base role), outsider, and a legacy
        // admin with no scoped membership all lack settings authority.
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->service->writeOrganizationValue($member, $this->org, 'workspace.display.density', 'compact'));
        $outsider = User::factory()->create(['username' => 'svc_outsider', 'status' => 'active']);
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->service->writeOrganizationValue($outsider, $this->org, 'workspace.display.density', 'compact'));
        $legacyAdmin = User::factory()->create(['username' => 'svc_legacy_admin', 'status' => 'active', 'role_key' => 'admin']);
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->service->writeOrganizationValue($legacyAdmin, $this->org, 'workspace.display.density', 'compact'));
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->service->effectiveFor($legacyAdmin, 'workspace.display.density', $this->org));

        // Organization authority does NOT imply workspace authority:
        // a second organization manager with no workspace membership
        // cannot write the workspace override.
        $otherOrgManager = $this->secondOrganizationManager();
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true);
        $this->assertServiceFails('setting_forbidden',
            fn () => $this->service->writeWorkspaceValue($otherOrgManager, $this->workspace, 'workspace.display.density', 'compact'));

        $this->assertSame(0, CoreSettingValue::query()->count());
    }

    public function test_workspace_override_flow_and_policy_versions(): void
    {
        // Write denied while the policy denies (default).
        $this->assertServiceFails('setting_override_denied',
            fn () => $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', 'compact'));

        $decision = $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true, expectedVersion: 0);
        $this->assertSame(['allow' => true, 'version' => 1, 'explicit' => true], $decision);
        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false, expectedVersion: 0));

        $written = $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', 'compact');
        $this->assertSame(1, $written->version);
        $effective = $this->service->effectiveFor($this->manager, 'workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('compact', $effective['value']);
        $this->assertSame('workspace_override', $effective['layer']->value);

        // Removal returns resolution to the organization/default layer.
        $this->service->removeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', expectedVersion: 1);
        $effective = $this->service->effectiveFor($this->manager, 'workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('comfortable', $effective['value']);

        $readBack = $this->service->overridePolicyFor($this->manager, $this->org, 'workspace.display.density');
        $this->assertTrue($readBack['allow']);
    }

    public function test_suspended_and_ended_organizations_deny_all_scope_writes(): void
    {
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true);
        $this->org->forceFill(['status' => 'suspended'])->save();

        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org->fresh(), 'workspace.display.density', 'compact'));
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', 'compact'));
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->setOverridePolicy($this->manager, $this->org->fresh(), 'workspace.display.density', false));

        $this->org->forceFill(['status' => 'ended'])->save();
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org->fresh(), 'workspace.display.density', 'compact'));
    }

    public function test_user_preferences_are_self_only_and_presentation_scoped(): void
    {
        $user = User::factory()->create(['username' => 'svc_pref', 'status' => 'active']);
        $other = User::factory()->create(['username' => 'svc_pref_other', 'status' => 'active']);

        $this->service->writeUserPreference($user, 'user.experience.locale', 'en');
        $this->assertSame('en', $this->service->preferenceFor($user, 'user.experience.locale')['value']);
        $this->assertSame('fa', $this->service->preferenceFor($other, 'user.experience.locale')['value'], "one user's preference never leaks into another's");

        // Organization-scoped keys are not user preferences.
        $this->assertValidationFails('setting_scope_not_allowed',
            fn () => $this->service->writeUserPreference($user, 'organization.public.description', 'x'));

        // Even for an organization manager, preferences stay personal:
        // the service signature has no target user at all.
        $this->service->writeUserPreference($this->manager, 'user.experience.timezone', 'Europe/Berlin');
        $this->assertSame('Europe/Berlin', $this->service->preferenceFor($this->manager, 'user.experience.timezone')['value']);
    }

    public function test_secret_and_disabled_module_writes_are_rejected_and_data_preserved(): void
    {
        $this->assertValidationFails('setting_secret_not_storable',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org, 'core.integrations.api_token', 'leak-me'));

        // Module unavailable in the catalog (tasks): org-scope write denied.
        $this->assertServiceFails('setting_module_unavailable',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org, 'tasks.organization.default_priority', 'high'));

        // Available but not enabled on the workspace: write denied.
        app(ModuleRegistrySynchronizer::class)->sync();
        $this->assertServiceFails('setting_module_disabled',
            fn () => $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'projects.workspace.default_view', 'board'));

        // Enable projects directly at the registry-state level, write, disable again.
        $projects = CoreModule::query()->where('key', 'projects')->firstOrFail();
        WorkspaceModule::query()->create([
            'workspace_id' => $this->workspace->id, 'module_id' => $projects->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
        ]);
        $this->service->setOverridePolicy($this->manager, $this->org, 'projects.workspace.default_view', true);
        $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'projects.workspace.default_view', 'board');
        WorkspaceModule::query()->where('workspace_id', $this->workspace->id)->update(['status' => WorkspaceModule::STATUS_DISABLED]);

        $this->assertServiceFails('setting_module_disabled',
            fn () => $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'projects.workspace.default_view', 'list'));
        $stored = app(SettingValueStore::class)->get('workspace', $this->workspace->id, 'projects.workspace.default_view');
        $this->assertTrue($stored->exists);
        $this->assertSame('board', $stored->value, 'disabled-module values are preserved, never deleted');
    }

    public function test_audit_failure_rolls_back_the_mutation(): void
    {
        AuditLog::creating(function (): void {
            throw new \RuntimeException('simulated audit failure');
        });

        try {
            $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact');
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(0, CoreSettingValue::query()->count(), 'mutation rolled back with the audit');
    }

    public function test_migration_000016_copies_legacy_public_metadata_idempotently(): void
    {
        $this->org->forceFill(['settings' => ['public' => ['description' => 'Migrated text', 'logo_url' => 'https://example.test/m.png'], 'private' => ['note' => 'not copied']]])->save();

        $migration = require database_path('migrations/2026_10_15_000016_settings_override_policy_versions_and_public_metadata.php');
        $migration->up();
        $stored = app(SettingValueStore::class)->get('organization', $this->org->id, 'organization.public.description');
        $this->assertTrue($stored->exists);
        $this->assertSame('Migrated text', $stored->value);

        // Idempotent: a second run changes nothing; private keys never copied.
        $migration->up();
        $this->assertSame(2, CoreSettingValue::query()->where('owner_id', $this->org->id)->count());
        $this->assertSame('Migrated text', $this->org->fresh()->settings['public']['description'], 'legacy JSON left intact');

        // Canonical precedence afterwards: an approved write wins and
        // the presenter follows it (single writable source).
        $this->service->writeOrganizationValue($this->manager, $this->org->fresh(), 'organization.public.description', 'Approved new text');
        $role = app(RoleProvisioner::class)->organizationMember($this->org);
        $issued = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org->fresh(), 'postmig@example.com', $role->id);
        $presentation = app(InvitationPresenter::class)->present($issued->invitation);
        $this->assertSame('Approved new text', $presentation->organization['description']);
    }

    private function secondOrganizationManager(): User
    {
        $user = User::factory()->create(['username' => 'svc_second_manager', 'status' => 'active']);
        $managerRole = app(RoleProvisioner::class)->organizationManager($this->org);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'role_id' => $managerRole->id, 'status' => MembershipStatus::Active]);

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

    private function assertValidationFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected SettingValidationException [{$code}]");
        } catch (SettingValidationException|SettingRegistryException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
