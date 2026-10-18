<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Settings\CoreSettingRevision;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValueStore;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C7-3 — immutable revisions and per-key restore:
 * create/update/remove chains, absent-vs-null, restore under
 * changed policy/permission conditions, secret exclusion.
 */
class SettingHistoryRestoreTest extends TestCase
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
            'integrations.demo.api_key', 'Demo API key', SettingDefinition::TYPE_STRING, null,
            [SettingDefinition::SCOPE_ORGANIZATION], nullable: true, sensitivity: 'secret',
        ));
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);
        $this->service = app(ScopedSettingService::class);

        $this->manager = User::factory()->create(['username' => 'hist_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'History Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_history_records_create_update_remove_with_absent_vs_null(): void
    {
        $this->service->writeOrganizationValue($this->manager, $this->org, 'organization.public.description', 'First text', expectedVersion: 0);
        $this->service->writeOrganizationValue($this->manager, $this->org, 'organization.public.description', null, expectedVersion: 1);
        $this->service->removeOrganizationValue($this->manager, $this->org, 'organization.public.description', expectedVersion: 2);

        $history = $this->service->revisionsFor($this->manager, 'organization.public.description', $this->org);
        $this->assertCount(3, $history);
        [$remove, $nullWrite, $create] = $history;

        $this->assertSame('create', $create['operation']);
        $this->assertFalse($create['previous_present']);
        $this->assertSame('First text', $create['new_value']);

        $this->assertSame('update', $nullWrite['operation']);
        $this->assertTrue($nullWrite['new_present'], 'explicit null is a present state');
        $this->assertNull($nullWrite['new_value']);
        $this->assertSame('First text', $nullWrite['previous_value']);

        $this->assertSame('remove', $remove['operation']);
        $this->assertTrue($remove['previous_present']);
        $this->assertNull($remove['previous_value'], 'previous state was the explicit null');
        $this->assertFalse($remove['new_present'], 'after removal the state is absent, not null');

        // Revisions are immutable rows with an audit link.
        $revision = CoreSettingRevision::query()->oldest('id')->firstOrFail();
        $this->assertNotNull($revision->audit_log_id);
        $this->assertSame($this->manager->id, (int) $revision->actor_user_id);
    }

    public function test_restore_recreates_prior_state_and_preserves_the_chain(): void
    {
        $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact', expectedVersion: 0);
        $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 1);

        $history = $this->service->revisionsFor($this->manager, 'workspace.display.density', $this->org);
        $createRevision = end($history);

        // Stale expectation rejected; current accepted.
        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->service->restoreOrganizationValue($this->manager, $this->org, 'workspace.display.density', $createRevision['id'], expectedVersion: 0));

        $restored = $this->service->restoreOrganizationValue($this->manager, $this->org, 'workspace.display.density', $createRevision['id'], expectedVersion: 2);
        $this->assertSame('compact', $restored->value);
        $this->assertSame(3, $restored->version, 'restore commits as a NEW version');

        $after = $this->service->revisionsFor($this->manager, 'workspace.display.density', $this->org);
        $this->assertCount(3, $after, 'prior chain preserved, restore appended');
        $this->assertSame('restore', $after[0]['operation']);
        $this->assertSame('comfortable', $after[0]['previous_value']);
        $this->assertSame('compact', $after[0]['new_value']);
    }

    public function test_restore_to_absent_removes_the_override(): void
    {
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true);
        $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', 'compact', expectedVersion: 0);

        // The creation revision's previous state is ABSENT.
        $history = $this->service->revisionsFor($this->manager, 'workspace.display.density', null, $this->workspace);
        $createRevision = end($history);
        $this->assertFalse($createRevision['previous_present']);

        $restored = $this->service->restoreWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', $createRevision['id'], expectedVersion: 1);
        $this->assertFalse($restored->exists, 'restoring absence removes the override (no null substitute stored)');
        $this->assertFalse(app(SettingValueStore::class)->get('workspace', $this->workspace->id, 'workspace.display.density')->exists);
    }

    public function test_restore_respects_current_policy_and_permissions(): void
    {
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true);
        $this->service->writeWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', 'compact', expectedVersion: 0);
        $history = $this->service->revisionsFor($this->manager, 'workspace.display.density', null, $this->workspace);
        $createRevision = end($history);

        // Policy now denies overrides: restoring a VALUE is denied…
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false);
        $this->assertServiceFails('setting_override_denied',
            fn () => $this->service->restoreWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', $createRevision['id'], expectedVersion: 1));

        // …while a suspended organization denies everything.
        $this->org->forceFill(['status' => 'suspended'])->save();
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->restoreWorkspaceValue($this->manager, $this->workspace->fresh(), 'workspace.display.density', $createRevision['id'], expectedVersion: 1));

        // A revision of ANOTHER scope/key is not found here (no
        // cross-scope leakage through revision ids).
        $this->org->forceFill(['status' => 'active'])->save();
        $orgWrite = $this->service->writeOrganizationValue($this->manager, $this->org->fresh(), 'workspace.display.density', 'comfortable');
        $orgHistory = $this->service->revisionsFor($this->manager, 'workspace.display.density', $this->org->fresh());
        $this->assertServiceFails('setting_revision_not_found',
            fn () => $this->service->restoreWorkspaceValue($this->manager, $this->workspace, 'workspace.display.density', $orgHistory[0]['id'], expectedVersion: 1));
    }

    public function test_secrets_never_enter_history_and_cannot_be_restored(): void
    {
        $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact');

        $this->assertServiceFails('setting_history_unavailable',
            fn () => $this->service->revisionsFor($this->manager, 'integrations.demo.api_key', $this->org));
        $this->assertSame(0, CoreSettingRevision::query()->where('setting_key', 'integrations.demo.api_key')->count());

        // Generic writes of secret keys remain rejected (C7-2 rule),
        // so no restore path for them can ever open.
        try {
            $this->service->writeOrganizationValue($this->manager, $this->org, 'integrations.demo.api_key', 'plaintext');
            $this->fail('secret write must be rejected');
        } catch (\App\Core\Settings\SettingValidationException $exception) {
            $this->assertSame('setting_secret_not_storable', $exception->errorCode);
        }
    }

    public function test_policy_changes_are_recorded_as_history(): void
    {
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', true, expectedVersion: 0);
        $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false, expectedVersion: 1);

        $history = $this->service->revisionsFor($this->manager, 'workspace.display.density', $this->org);
        $this->assertCount(2, $history);
        $this->assertSame('policy', $history[0]['operation']);
        $this->assertSame(true, $history[0]['previous_value']);
        $this->assertSame(false, $history[0]['new_value']);
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
