<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingServiceException;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C7-2 — MySQL/InnoDB concurrency for scoped settings
 * mutations. Proves committed postconditions only: competing
 * writes serialize on the documented lock order (Organization row
 * → Workspace row → setting row), stale expected-versions are
 * rejected after the race, and a committed suspension denies a
 * racing write. Runs only under MySQL (wired into the permanent
 * MySQL CI step).
 */
class ScopedSettingsConcurrencyMysqlTest extends TestCase
{
    private User $manager;

    private Organization $org;

    private ScopedSettingService $service;

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
        app(SettingsRegistrySynchronizer::class)->sync($registry);
        $this->app->instance(SettingsRegistry::class, $registry);
        $this->service = app(ScopedSettingService::class);

        $this->manager = User::factory()->create(['username' => 'conc_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Concurrency Org');
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
            foreach ([
                'core_setting_values', 'core_setting_override_policies', 'core_setting_definitions',
                'audit_logs', 'workspace_memberships', 'organization_memberships',
                'core_role_permissions', 'core_roles', 'workspaces', 'organizations', 'users', 'core_permissions',
            ] as $table) {
                DB::table($table)->delete();
            }
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        parent::tearDown();
    }

    public function test_competing_organization_writes_serialize_on_the_organization_row_lock(): void
    {
        $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 0);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner is mid-write: organization row locked, value bumped to v2 uncommitted.
            $winner->table('organizations')->where('id', $this->org->id)->lockForUpdate()->first();
            $winner->table('core_setting_values')
                ->where('owner_type', 'organization')->where('owner_id', $this->org->id)
                ->where('setting_key', 'workspace.display.density')
                ->update(['value_json' => json_encode('compact'), 'version' => 2]);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact', expectedVersion: 1);
                $this->fail('Concurrent write must block on the organization row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // Postcondition: exactly the winner's commit exists.
        $row = DB::table('core_setting_values')->where('owner_id', $this->org->id)->sole();
        $this->assertSame(2, (int) $row->version);
        $this->assertSame('"compact"', $row->value_json);

        // A stale writer is now rejected; the current version writes cleanly.
        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 1));
        $written = $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'comfortable', expectedVersion: 2);
        $this->assertSame(3, $written->version);
    }

    public function test_committed_suspension_denies_the_racing_write(): void
    {
        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('organizations')->where('id', $this->org->id)->lockForUpdate()->first();
            $winner->table('organizations')->where('id', $this->org->id)->update(['status' => 'suspended']);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $this->service->writeOrganizationValue($this->manager, $this->org, 'workspace.display.density', 'compact');
                $this->fail('Racing write must block on the organization row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // After the suspension commits, the write is denied by the
        // lifecycle check under the lock — nothing stored, no audit.
        $this->assertServiceFails('setting_organization_unavailable',
            fn () => $this->service->writeOrganizationValue($this->manager, $this->org->fresh(), 'workspace.display.density', 'compact'));
        $this->assertSame(0, DB::table('core_setting_values')->count());
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'setting.value_written')->count());
    }

    public function test_policy_expected_version_is_checked_under_the_policy_row_lock(): void
    {
        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_setting_override_policies')->insert([
                'organization_id' => $this->org->id, 'setting_key' => 'workspace.display.density',
                'allow_workspace_override' => true, 'version' => 1,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $winner->table('core_setting_override_policies')->where('organization_id', $this->org->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false, expectedVersion: 0);
                $this->fail('Policy write must block on the policy row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        // The committed policy is v1: creation expectations are stale.
        $this->assertServiceFails('setting_version_conflict',
            fn () => $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false, expectedVersion: 0));
        $decision = $this->service->setOverridePolicy($this->manager, $this->org, 'workspace.display.density', false, expectedVersion: 1);
        $this->assertSame(['allow' => false, 'version' => 2, 'explicit' => true], $decision);
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
