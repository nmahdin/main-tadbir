<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\Services\ScopedSecretService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C7-3 — MySQL/InnoDB concurrency for secrets and restore.
 * Committed postconditions only: a racing secret replace
 * serializes on the Organization row lock; a racing restore
 * cannot resurrect a value over a committed concurrent write
 * (stale expected version rejected after the race).
 */
class SettingsSecretsConcurrencyMysqlTest extends TestCase
{
    private User $manager;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency proof.');
        }

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');

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

        $this->manager = User::factory()->create(['username' => 'c73_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'C7-3 Concurrency Org');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            foreach ([
                'core_setting_secrets', 'core_setting_revisions', 'core_setting_values', 'core_setting_override_policies', 'core_setting_definitions',
                'audit_logs', 'workspace_memberships', 'organization_memberships',
                'core_role_permissions', 'core_roles', 'workspaces', 'organizations', 'users', 'core_permissions',
            ] as $table) {
                DB::table($table)->delete();
            }
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        parent::tearDown();
    }

    public function test_competing_secret_replace_serializes_and_versions_stay_monotonic(): void
    {
        $admin = $this->grantOrganizationSecrets($this->manager);
        $secrets = app(ScopedSecretService::class);
        $secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'race-one', expectedVersion: 0);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $this->org->id)->lockForUpdate()->first();
            $winner->table('core_setting_secrets')->where('owner_id', $this->org->id)->update(['version' => 2]);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'race-two', expectedVersion: 1);
                $this->fail('Concurrent secret replace must block on the organization row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // Postconditions: winner's version stands; the loser's
        // stale expectation is rejected, the current accepted.
        $this->assertSame(2, (int) DB::table('core_setting_secrets')->where('owner_id', $this->org->id)->value('version'));
        try {
            $secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'race-two', expectedVersion: 1);
            $this->fail('stale secret version must be rejected');
        } catch (\App\Core\Settings\SettingServiceException $exception) {
            $this->assertSame('setting_version_conflict', $exception->errorCode);
        }
        $metadata = $secrets->putOrganizationSecret($admin, $this->org, 'integrations.demo.api_key', 'race-two', expectedVersion: 2);
        $this->assertSame(3, $metadata['version']);
        $this->assertSame('race-two', $secrets->consumeForOrganization($this->org->fresh(), 'integrations.demo.api_key'));
    }

    public function test_racing_restore_cannot_overwrite_a_committed_write(): void
    {
        $service = app(ScopedSettingService::class);
        $service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact', expectedVersion: 0);
        $service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 1);
        $history = $service->revisionsFor($this->manager, 'workspace.display.density', $this->org);
        $createRevision = end($history);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $this->org->id)->lockForUpdate()->first();
            $winner->table('core_setting_values')->where('owner_id', $this->org->id)->update(['version' => 3]);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $service->restoreOrganizationValue($this->manager, $this->org, 'workspace.display.density', $createRevision['id'], expectedVersion: 2);
                $this->fail('Concurrent restore must block on the organization row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // The stale restore is rejected; with the committed version
        // it proceeds and appends (never rewrites) history.
        try {
            $service->restoreOrganizationValue($this->manager, $this->org, 'workspace.display.density', $createRevision['id'], expectedVersion: 2);
            $this->fail('stale restore must be rejected');
        } catch (\App\Core\Settings\SettingServiceException $exception) {
            $this->assertSame('setting_version_conflict', $exception->errorCode);
        }
        $restored = $service->restoreOrganizationValue($this->manager, $this->org, 'workspace.display.density', $createRevision['id'], expectedVersion: 3);
        $this->assertSame('compact', $restored->value);
        $this->assertSame(3, DB::table('core_setting_revisions')->where('owner_id', $this->org->id)->count());
    }

    private function grantOrganizationSecrets(User $user): User
    {
        $permission = ScopedPermission::query()->where('key', 'organization.settings.secrets.manage')->firstOrFail();
        $role = ScopedRole::query()->firstOrCreate(
            ['scope' => 'organization', 'organization_id' => $this->org->id, 'key' => 'secret_administrators'],
            ['name' => 'Secret Administrators'],
        );
        $role->permissions()->sync([$permission->id]);
        $membership = \App\Core\Organizations\OrganizationMembership::query()
            ->where('organization_id', $this->org->id)->where('user_id', $user->id)->firstOrFail();
        $membership->forceFill(['role_id' => $role->id])->save();

        return $user;
    }
}
