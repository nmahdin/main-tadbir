<?php

namespace Tests\Feature\Core;

use App\Core\Invitations\InvitationPresenter;
use App\Core\Invitations\InvitationService;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\CoreSettingDefinition;
use App\Core\Settings\CoreSettingDefinitions;
use App\Core\Settings\CoreSettingValue;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingValidationException;
use App\Core\Settings\SettingValueStore;
use App\Core\Settings\SettingValueValidator;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C7-1 — code-defined scoped settings registry, validation
 * contracts, synchronization, and the persistence primitives the
 * C7-2 workflows will authorize and audit.
 */
class SettingsRegistryTest extends TestCase
{
    use RefreshDatabase;

    private SettingsRegistry $registry;

    private SettingValueStore $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        $this->registry = SettingsRegistry::withCoreDefinitions();
        app(SettingsRegistrySynchronizer::class)->sync($this->registry);
        $this->store = app(SettingValueStore::class);
    }

    public function test_core_definitions_are_stable_and_fingerprints_deterministic(): void
    {
        $keys = array_map(fn (SettingDefinition $definition) => $definition->key, $this->registry->all());
        // The catalog pin (C7-1) extended deliberately in C7-4 with
        // the two inheritable display defaults the settings screens
        // manage, and in UX-02-3 with the presentation-only
        // list-column visibility preference; everything else about
        // this contract is unchanged.
        $this->assertSame([
            'display.locale',
            'display.timezone',
            'organization.public.description',
            'organization.public.logo_url',
            'user.experience.list_columns',
            'user.experience.locale',
            'user.experience.timezone',
        ], $keys);

        $again = SettingsRegistry::withCoreDefinitions();
        foreach ($this->registry->all() as $definition) {
            $this->assertSame($definition->fingerprint(), $again->get($definition->key)->fingerprint());
            $persisted = CoreSettingDefinition::query()->where('key', $definition->key)->firstOrFail();
            $this->assertSame($definition->fingerprint(), $persisted->fingerprint);
            $this->assertSame($definition->owner, $persisted->owner);
        }

        // Container wiring exposes the same registry.
        $this->assertSame($keys, array_map(fn (SettingDefinition $definition) => $definition->key, app(SettingsRegistry::class)->all()));
    }

    public function test_duplicate_and_conflicting_registrations_are_rejected(): void
    {
        $registry = new SettingsRegistry;
        $definition = new SettingDefinition('test.sample.key', 'Sample', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_USER]);
        $registry->register($definition);

        $this->assertRegistryFails('setting_key_duplicate', fn () => $registry->register($definition));
        $conflicting = new SettingDefinition('test.sample.key', 'Sample', SettingDefinition::TYPE_INTEGER, 1, [SettingDefinition::SCOPE_USER]);
        $this->assertRegistryFails('setting_key_duplicate', fn () => $registry->register($conflicting));
    }

    public function test_module_ownership_is_enforced(): void
    {
        $registry = new SettingsRegistry;
        $moduleDefinition = new SettingDefinition('projects.workspace.default_view', 'Default view', SettingDefinition::TYPE_ENUM, 'list', [SettingDefinition::SCOPE_WORKSPACE], owner: 'projects', constraints: ['values' => ['list', 'board']]);

        $registry->registerForModule('projects', $moduleDefinition);
        $this->assertTrue($registry->has('projects.workspace.default_view'));

        $this->assertRegistryFails('setting_owner_unknown', fn () => $registry->registerForModule('no_such_module', $moduleDefinition));
        $this->assertRegistryFails('setting_owner_mismatch', fn () => $registry->registerForModule('projects',
            new SettingDefinition('tasks.workspace.other', 'Other', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_WORKSPACE], owner: 'tasks')));
        $this->assertRegistryFails('setting_owner_unknown', fn () => $registry->register(
            new SettingDefinition('ghost.module.key', 'Ghost', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_USER], owner: 'ghost')));
    }

    public function test_invalid_definitions_are_rejected(): void
    {
        $registry = new SettingsRegistry;

        $this->assertRegistryFails('setting_type_unsupported', fn () => $registry->register(
            new SettingDefinition('test.bad.type', 'T', 'float', 1.5, [SettingDefinition::SCOPE_USER])));
        $this->assertRegistryFails('setting_scope_unsupported', fn () => $registry->register(
            new SettingDefinition('test.bad.scope', 'T', SettingDefinition::TYPE_STRING, 'x', ['galaxy'])));
        $this->assertRegistryFails('setting_constraints_invalid', fn () => $registry->register(
            new SettingDefinition('test.bad.enum', 'T', SettingDefinition::TYPE_ENUM, 'a', [SettingDefinition::SCOPE_USER])));
        $this->assertRegistryFails('setting_constraints_invalid', fn () => $registry->register(
            new SettingDefinition('test.bad.json', 'T', SettingDefinition::TYPE_JSON, [], [SettingDefinition::SCOPE_USER])));
        $this->assertRegistryFails('setting_default_invalid', fn () => $registry->register(
            new SettingDefinition('test.bad.default', 'T', SettingDefinition::TYPE_INTEGER, 'five', [SettingDefinition::SCOPE_USER])));
        $this->assertRegistryFails('setting_default_invalid', fn () => $registry->register(
            new SettingDefinition('test.bad.nullable', 'T', SettingDefinition::TYPE_STRING, null, [SettingDefinition::SCOPE_USER])));
        $this->assertRegistryFails('setting_inheritance_unsupported', fn () => $registry->register(
            new SettingDefinition('test.bad.inherit', 'T', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_ORGANIZATION], inheritance: 'organization_to_workspace')));
        $this->assertRegistryFails('setting_key_invalid', fn () => $registry->register(
            new SettingDefinition('NoDotsOrCaps', 'T', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_USER])));
    }

    public function test_type_validation_is_strict_and_normalizing(): void
    {
        $string = new SettingDefinition('t.s', 'T', SettingDefinition::TYPE_STRING, 'x', [SettingDefinition::SCOPE_USER], constraints: ['max_length' => 3]);
        $this->assertSame('abc', SettingValueValidator::validate($string, '  abc  '));
        $this->assertValidationFails('setting_value_too_long', fn () => SettingValueValidator::validate($string, 'abcd'));
        $this->assertValidationFails('setting_value_type_mismatch', fn () => SettingValueValidator::validate($string, 5));

        $bool = new SettingDefinition('t.b', 'T', SettingDefinition::TYPE_BOOLEAN, true, [SettingDefinition::SCOPE_USER]);
        $this->assertFalse(SettingValueValidator::validate($bool, false));
        $this->assertValidationFails('setting_value_type_mismatch', fn () => SettingValueValidator::validate($bool, 1));

        $int = new SettingDefinition('t.i', 'T', SettingDefinition::TYPE_INTEGER, 5, [SettingDefinition::SCOPE_USER], constraints: ['min' => 1, 'max' => 10]);
        $this->assertSame(7, SettingValueValidator::validate($int, 7));
        $this->assertValidationFails('setting_value_type_mismatch', fn () => SettingValueValidator::validate($int, '7'));
        $this->assertValidationFails('setting_value_out_of_range', fn () => SettingValueValidator::validate($int, 11));

        $enum = new SettingDefinition('t.e', 'T', SettingDefinition::TYPE_ENUM, 'a', [SettingDefinition::SCOPE_USER], constraints: ['values' => ['a', 'b']]);
        $this->assertValidationFails('setting_enum_invalid', fn () => SettingValueValidator::validate($enum, 'c'));

        $timezone = $this->registry->get('user.experience.timezone');
        $this->assertSame('Asia/Tehran', SettingValueValidator::validate($timezone, 'Asia/Tehran'));
        $this->assertValidationFails('setting_timezone_invalid', fn () => SettingValueValidator::validate($timezone, 'Mars/Olympus'));

        $locale = $this->registry->get('user.experience.locale');
        $this->assertSame('en', SettingValueValidator::validate($locale, 'en'));
        $this->assertValidationFails('setting_locale_invalid', fn () => SettingValueValidator::validate($locale, 'de'));

        $json = new SettingDefinition('t.j', 'T', SettingDefinition::TYPE_JSON, [], [SettingDefinition::SCOPE_USER], constraints: ['schema' => ['compact' => 'boolean', 'page_size' => 'integer']]);
        $this->assertSame(['compact' => true, 'page_size' => 20], SettingValueValidator::validate($json, ['page_size' => 20, 'compact' => true]));
        $this->assertValidationFails('setting_json_schema_invalid', fn () => SettingValueValidator::validate($json, ['unknown' => 1]));
        $this->assertValidationFails('setting_json_schema_invalid', fn () => SettingValueValidator::validate($json, ['compact' => 'yes']));
    }

    public function test_synchronization_is_idempotent_with_no_side_effects(): void
    {
        $result = app(SettingsRegistrySynchronizer::class)->sync($this->registry);
        $this->assertSame(0, $result['created']);
        // 7 since UX-02-3 added user.experience.list_columns.
        $this->assertSame(7, $result['unchanged']);

        // No values materialized, no modules activated, nothing granted.
        $this->assertSame(0, CoreSettingValue::query()->count());
        $this->assertSame(0, WorkspaceModule::query()->count());
    }

    public function test_persisted_drift_aborts_synchronization(): void
    {
        CoreSettingDefinition::query()->where('key', 'user.experience.locale')
            ->update(['fingerprint' => str_repeat('0', 64)]);

        $this->assertRegistryFails('setting_registry_drift',
            fn () => app(SettingsRegistrySynchronizer::class)->sync($this->registry));

        // Unknown persisted keys are drift too.
        CoreSettingDefinition::query()->where('key', 'user.experience.locale')
            ->update(['fingerprint' => $this->registry->get('user.experience.locale')->fingerprint()]);
        CoreSettingDefinition::query()->create([
            'key' => 'rogue.unknown.key', 'title' => 'Rogue', 'type' => 'string',
            'default_value' => null, 'allowed_scopes' => ['user'], 'constraints' => null,
            'inheritance' => 'none', 'owner' => 'core', 'sensitivity' => 'internal',
            'version' => 1, 'fingerprint' => str_repeat('1', 64),
        ]);
        $this->assertRegistryFails('setting_registry_drift',
            fn () => app(SettingsRegistrySynchronizer::class)->sync($this->registry));
    }

    public function test_version_bumped_definition_updates_on_sync(): void
    {
        $registry = new SettingsRegistry;
        foreach (CoreSettingDefinitions::all() as $definition) {
            if ($definition->key === 'user.experience.locale') {
                continue;
            }
            $registry->register($definition);
        }
        $registry->register(new SettingDefinition('user.experience.locale', 'Interface locale', SettingDefinition::TYPE_LOCALE, 'en', [SettingDefinition::SCOPE_USER], constraints: ['values' => ['fa', 'en']], userOverride: true, version: 2));

        $result = app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->assertSame(1, $result['updated']);
        $this->assertSame('en', CoreSettingDefinition::query()->where('key', 'user.experience.locale')->firstOrFail()->default_value);
    }

    public function test_value_store_uniqueness_versions_and_explicit_null(): void
    {
        $user = User::factory()->create(['username' => 'set_user', 'status' => 'active']);

        $absent = $this->store->get('user', $user->id, 'user.experience.locale');
        $this->assertFalse($absent->exists);

        $first = $this->store->put('user', $user->id, 'user.experience.locale', 'en', $user->id);
        $this->assertSame(1, $first->version);
        $second = $this->store->put('user', $user->id, 'user.experience.locale', 'fa', $user->id);
        $this->assertSame(2, $second->version);
        $this->assertSame(1, CoreSettingValue::query()->count(), 'one row per (owner, key) — updates are in place');
        $this->assertSame('fa', $this->store->get('user', $user->id, 'user.experience.locale')->value);

        // Absent override vs explicit null are distinguishable.
        $owner = User::factory()->create(['username' => 'set_manager', 'status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($owner, 'Settings Org');
        $this->assertFalse($this->store->get('organization', $organization->id, 'organization.public.description')->exists);
        $null = $this->store->put('organization', $organization->id, 'organization.public.description', null);
        $this->assertTrue($null->exists);
        $this->assertNull($null->value);
        $stored = $this->store->get('organization', $organization->id, 'organization.public.description');
        $this->assertTrue($stored->exists);
        $this->assertNull($stored->value);

        $this->store->forget('organization', $organization->id, 'organization.public.description');
        $this->assertFalse($this->store->get('organization', $organization->id, 'organization.public.description')->exists);
    }

    public function test_value_store_enforces_scope_owner_and_registration(): void
    {
        $user = User::factory()->create(['username' => 'set_scope', 'status' => 'active']);

        $this->assertValidationFails('setting_scope_not_allowed',
            fn () => $this->store->put('user', $user->id, 'organization.public.description', 'nope'));
        $this->assertValidationFails('setting_owner_not_found',
            fn () => $this->store->put('organization', 999999, 'organization.public.description', 'nope'));
        $this->assertRegistryFails('setting_not_found',
            fn () => $this->store->put('organization', 1, 'never.registered.key', 'nope'));
    }

    public function test_secret_definitions_can_never_enter_generic_storage(): void
    {
        $registry = SettingsRegistry::withCoreDefinitions();
        $registry->register(new SettingDefinition(
            'core.integrations.api_token', 'API token', SettingDefinition::TYPE_STRING, null,
            [SettingDefinition::SCOPE_ORGANIZATION], nullable: true, sensitivity: 'secret',
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);

        $owner = User::factory()->create(['username' => 'set_secret', 'status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($owner, 'Secret Org');

        $this->assertValidationFails('setting_secret_not_storable',
            fn () => $this->store->put('organization', $organization->id, 'core.integrations.api_token', 'super-secret'));
        $this->assertSame(0, CoreSettingValue::query()->where('setting_key', 'core.integrations.api_token')->count());
    }

    public function test_override_policies_default_to_deny_and_store_explicitly(): void
    {
        $registry = SettingsRegistry::withCoreDefinitions();
        $registry->register(new SettingDefinition(
            'workspace.display.density', 'Density', SettingDefinition::TYPE_ENUM, 'comfortable',
            [SettingDefinition::SCOPE_ORGANIZATION, SettingDefinition::SCOPE_WORKSPACE],
            constraints: ['values' => ['comfortable', 'compact']],
            inheritance: 'organization_to_workspace',
            workspaceOverride: true,
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);

        $owner = User::factory()->create(['username' => 'set_policy', 'status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($owner, 'Policy Org');

        $this->assertFalse($this->store->allowsWorkspaceOverride($organization->id, 'workspace.display.density'), 'missing policy = registry default = deny');
        $this->store->putOverridePolicy($organization->id, 'workspace.display.density', true, $owner->id);
        $this->assertTrue($this->store->allowsWorkspaceOverride($organization->id, 'workspace.display.density'));
        $this->store->putOverridePolicy($organization->id, 'workspace.display.density', false, $owner->id);
        $this->assertFalse($this->store->allowsWorkspaceOverride($organization->id, 'workspace.display.density'));

        $this->assertValidationFails('setting_override_not_supported',
            fn () => $this->store->putOverridePolicy($organization->id, 'user.experience.locale', true));
    }

    public function test_c6_public_organization_settings_are_preserved(): void
    {
        PermissionCatalog::sync();
        $manager = User::factory()->create(['username' => 'set_c6_manager', 'status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($manager, 'Legacy Public Org');
        $organization->forceFill(['settings' => ['public' => ['description' => 'Approved public text', 'logo_url' => 'https://example.test/logo.png'], 'private' => ['secret_note' => 'never public']]])->save();

        $role = app(RoleProvisioner::class)->organizationMember($organization);
        $issued = app(InvitationService::class)->issueOrganizationInvitation($manager, $organization, 'viewer@example.com', $role->id);
        $presentation = app(InvitationPresenter::class)->present($issued->invitation);

        $this->assertSame('Approved public text', $presentation->organization['description']);
        $this->assertSame('https://example.test/logo.png', $presentation->organization['logo_url']);
        $this->assertStringNotContainsString('never public', (string) json_encode($presentation->toArray()));

        // Registry metadata records the same legacy source; sync left data untouched.
        $definition = $this->registry->get('organization.public.description');
        $this->assertSame('organizations.settings.public.description', $definition->constraints['legacy_source']);
        $this->assertSame('Approved public text', $organization->fresh()->settings['public']['description']);
        $this->assertSame(0, CoreSettingValue::query()->count(), 'C7-1 creates no second writable source for legacy metadata');
    }

    private function assertRegistryFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected SettingRegistryException [{$code}]");
        } catch (SettingRegistryException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }

    private function assertValidationFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected SettingValidationException [{$code}]");
        } catch (SettingValidationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
