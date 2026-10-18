<?php

namespace Tests\Feature\Core;

use App\Core\Invitations\InvitationPresenter;
use App\Core\Invitations\InvitationService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\CoreSettingValue;
use App\Core\Settings\EffectiveSettingResolver;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingLayer;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingValueStore;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C7-2 — effective settings resolution: layered precedence,
 * persisted-ownership derivation, override suppression, mandatory
 * ceilings, legacy public-metadata compatibility.
 */
class EffectiveSettingsResolverTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $workspace;

    private SettingValueStore $store;

    private EffectiveSettingResolver $resolver;

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
            'workspace.display.language', 'Display language', SettingDefinition::TYPE_LOCALE, 'fa',
            [SettingDefinition::SCOPE_USER, SettingDefinition::SCOPE_WORKSPACE, SettingDefinition::SCOPE_ORGANIZATION],
            constraints: ['values' => ['fa', 'en']],
            inheritance: SettingDefinition::INHERITANCE_ORGANIZATION_TO_WORKSPACE,
            workspaceOverride: true,
            userOverride: true,
        ));
        $registry->register(new SettingDefinition(
            'workspace.security.session_policy', 'Session policy', SettingDefinition::TYPE_ENUM, 'standard',
            [SettingDefinition::SCOPE_ORGANIZATION, SettingDefinition::SCOPE_WORKSPACE],
            constraints: ['values' => ['standard', 'strict']],
            inheritance: SettingDefinition::INHERITANCE_ORGANIZATION_TO_WORKSPACE,
            workspaceOverride: true,
            mandatory: true,
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);

        $this->store = app(SettingValueStore::class);
        $this->resolver = app(EffectiveSettingResolver::class);

        $this->manager = User::factory()->create(['username' => 'res_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Resolver Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_platform_default_fallback_and_layers(): void
    {
        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('comfortable', $resolved['value']);
        $this->assertSame(SettingLayer::PlatformDefault, $resolved['layer']);
        $this->assertFalse($resolved['has_explicit_value']);

        // Organization value inherits into the workspace immediately.
        $this->store->put('organization', $this->org->id, 'workspace.display.density', 'compact');
        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('compact', $resolved['value']);
        $this->assertSame(SettingLayer::OrganizationValue, $resolved['layer']);

        // Nothing was materialized into workspace rows.
        $this->assertSame(1, CoreSettingValue::query()->count());
    }

    public function test_workspace_override_policy_gates_and_suppression_preserves_values(): void
    {
        $this->store->put('organization', $this->org->id, 'workspace.display.density', 'comfortable');
        $this->store->put('workspace', $this->workspace->id, 'workspace.display.density', 'compact');

        // Default-deny: the stored workspace override is ignored.
        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('comfortable', $resolved['value']);
        $this->assertSame(SettingLayer::OrganizationValue, $resolved['layer']);

        // Allowed: the workspace override becomes effective.
        $this->store->putOverridePolicy($this->org->id, 'workspace.display.density', true);
        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('compact', $resolved['value']);
        $this->assertSame(SettingLayer::WorkspaceOverride, $resolved['layer']);

        // Denied again: value retained in storage, ignored in resolution.
        $this->store->putOverridePolicy($this->org->id, 'workspace.display.density', false);
        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace);
        $this->assertSame('comfortable', $resolved['value']);
        $this->assertTrue($this->store->get('workspace', $this->workspace->id, 'workspace.display.density')->exists);

        // Re-allowed: the preserved value is effective again.
        $this->store->putOverridePolicy($this->org->id, 'workspace.display.density', true);
        $this->assertSame('compact', $this->resolver->resolve('workspace.display.density', $this->org, $this->workspace)['value']);
    }

    public function test_user_preference_beats_workspace_and_organization_where_permitted(): void
    {
        $user = User::factory()->create(['username' => 'res_user', 'status' => 'active']);
        $this->store->put('organization', $this->org->id, 'workspace.display.language', 'fa');
        $this->store->put('workspace', $this->workspace->id, 'workspace.display.language', 'fa');
        $this->store->putOverridePolicy($this->org->id, 'workspace.display.language', true);
        $this->store->put('user', $user->id, 'workspace.display.language', 'en');

        $resolved = $this->resolver->resolve('workspace.display.language', $this->org, $this->workspace, $user);
        $this->assertSame('en', $resolved['value']);
        $this->assertSame(SettingLayer::UserPreference, $resolved['layer']);

        // Without a user in context, the workspace layer wins.
        $resolved = $this->resolver->resolve('workspace.display.language', $this->org, $this->workspace);
        $this->assertSame(SettingLayer::WorkspaceOverride, $resolved['layer']);
    }

    public function test_mandatory_policy_cannot_be_bypassed(): void
    {
        $this->store->put('workspace', $this->workspace->id, 'workspace.security.session_policy', 'standard');
        $this->store->putOverridePolicy($this->org->id, 'workspace.security.session_policy', true);
        $this->store->put('organization', $this->org->id, 'workspace.security.session_policy', 'strict');

        $resolved = $this->resolver->resolve('workspace.security.session_policy', $this->org, $this->workspace, $this->manager);
        $this->assertSame('strict', $resolved['value']);
        $this->assertSame(SettingLayer::OrganizationValue, $resolved['layer'], 'mandatory ignores workspace/user layers entirely');
    }

    public function test_organization_comes_from_persisted_workspace_never_from_caller(): void
    {
        $otherManager = User::factory()->create(['username' => 'res_other_manager', 'status' => 'active']);
        $otherOrg = app(OrganizationProvisioner::class)->create($otherManager, 'Other Org');
        $this->store->put('organization', $this->org->id, 'workspace.display.density', 'compact');
        $this->store->put('organization', $otherOrg->id, 'workspace.display.density', 'comfortable');

        // Caller passes the WRONG organization; persisted ownership wins.
        $resolved = $this->resolver->resolve('workspace.display.density', $otherOrg, $this->workspace);
        $this->assertSame('compact', $resolved['value']);
        $this->assertSame($this->org->id, $resolved['source']['owner_id']);
    }

    public function test_personal_workspace_skips_the_organization_layer(): void
    {
        $owner = User::factory()->create(['username' => 'res_personal', 'status' => 'active']);
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->store->put('organization', $this->org->id, 'workspace.display.density', 'compact');

        $resolved = $this->resolver->resolve('workspace.display.density', $this->org, $personal);
        $this->assertSame('comfortable', $resolved['value'], 'personal workspace never inherits an organization layer');
        $this->assertSame(SettingLayer::PlatformDefault, $resolved['layer']);

        // The owner's own preference still applies.
        $this->store->put('user', $owner->id, 'user.experience.locale', 'en');
        $resolved = $this->resolver->resolve('user.experience.locale', null, $personal, $owner);
        $this->assertSame('en', $resolved['value']);
        $this->assertSame(SettingLayer::UserPreference, $resolved['layer']);
    }

    public function test_explicit_null_is_distinguished_from_absent(): void
    {
        $resolved = $this->resolver->resolve('organization.public.description', $this->org);
        $this->assertNull($resolved['value']);
        $this->assertFalse($resolved['has_explicit_value']);
        $this->assertSame(SettingLayer::PlatformDefault, $resolved['layer']);

        $this->store->put('organization', $this->org->id, 'organization.public.description', null);
        $resolved = $this->resolver->resolve('organization.public.description', $this->org);
        $this->assertNull($resolved['value']);
        $this->assertTrue($resolved['has_explicit_value']);
        $this->assertSame(SettingLayer::OrganizationValue, $resolved['layer']);
    }

    public function test_legacy_public_metadata_fallback_canonical_precedence_and_presenter_parity(): void
    {
        $this->org->forceFill(['settings' => ['public' => ['description' => 'Legacy text', 'logo_url' => 'https://example.test/legacy.png']]])->save();

        $resolved = $this->resolver->resolve('organization.public.description', $this->org->fresh());
        $this->assertSame('Legacy text', $resolved['value']);
        $this->assertTrue($resolved['source']['legacy']);

        // Canonical write wins over legacy; presenter agrees exactly.
        $this->store->put('organization', $this->org->id, 'organization.public.description', 'Canonical text');
        $resolved = $this->resolver->resolve('organization.public.description', $this->org->fresh());
        $this->assertSame('Canonical text', $resolved['value']);
        $this->assertFalse($resolved['source']['legacy']);

        $role = app(RoleProvisioner::class)->organizationMember($this->org);
        $issued = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org->fresh(), 'parity@example.com', $role->id);
        $presentation = app(InvitationPresenter::class)->present($issued->invitation);
        $this->assertSame('Canonical text', $presentation->organization['description']);
        $this->assertSame('https://example.test/legacy.png', $presentation->organization['logo_url'], 'untouched keys still fall back to legacy');

        // Explicit canonical null clears — it does NOT resurrect legacy.
        $this->store->put('organization', $this->org->id, 'organization.public.description', null);
        $presentation = app(InvitationPresenter::class)->present($issued->invitation->fresh());
        $this->assertNull($presentation->organization['description']);
        $this->assertNull($this->resolver->resolve('organization.public.description', $this->org->fresh())['value']);
    }
}
