<?php

namespace Tests\Feature\Core;

use App\Core\Settings\CoreSettingDefinition;
use App\Core\Settings\CoreSettingValue;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

/**
 * MySQL-only schema evidence for Stage C7-1: CHECK domains,
 * restrictive FKs, and uniqueness on the settings tables
 * (SQLite cannot enforce the CHECK set; domain-level equivalents
 * are covered by SettingsRegistryTest).
 */
class SettingsSchemaMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $organizationIds = [];

    /** @var list<int> */
    private array $userIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only schema test (SQLite cannot enforce these CHECK constraints).');
        }
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('core_setting_override_policies')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('core_setting_values')->whereIn('owner_id', array_merge($this->organizationIds, $this->userIds))->delete();
            DB::table('core_setting_definitions')->where('key', 'like', 'mysqltest.%')->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_settings_schema_constraints_on_mysql(): void
    {
        foreach (['core_setting_definitions', 'core_setting_values', 'core_setting_override_policies'] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }

        $definition = CoreSettingDefinition::query()->create([
            'key' => 'mysqltest.sample.key', 'title' => 'Sample', 'type' => 'string',
            'default_value' => null, 'allowed_scopes' => ['organization'], 'constraints' => null,
            'inheritance' => 'none', 'nullable' => true, 'owner' => 'core',
            'sensitivity' => 'internal', 'version' => 1, 'fingerprint' => str_repeat('a', 64),
        ]);

        $userId = (int) DB::table('users')->insertGetId([
            'name' => 'MySQL Settings User', 'username' => 'mysql_settings_user',
            'password' => 'x', 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->userIds[] = $userId;
        $organizationId = (int) DB::table('organizations')->insertGetId([
            'name' => 'MySQL Settings Org', 'slug' => 'mysql-settings-org', 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->organizationIds[] = $organizationId;

        CoreSettingValue::query()->create([
            'setting_key' => 'mysqltest.sample.key', 'owner_type' => 'organization',
            'owner_id' => $organizationId, 'value_json' => '"one"', 'version' => 1,
        ]);

        // Unique (owner_type, owner_id, setting_key).
        $this->assertQueryFails(fn () => CoreSettingValue::query()->create([
            'setting_key' => 'mysqltest.sample.key', 'owner_type' => 'organization',
            'owner_id' => $organizationId, 'value_json' => '"two"', 'version' => 1,
        ]));

        // FK: values must reference a registered definition key.
        $this->assertQueryFails(fn () => CoreSettingValue::query()->create([
            'setting_key' => 'mysqltest.missing.key', 'owner_type' => 'organization',
            'owner_id' => $organizationId, 'value_json' => '"x"', 'version' => 1,
        ]));

        // CHECK: owner_type domain.
        $this->assertQueryFails(fn () => CoreSettingValue::query()->create([
            'setting_key' => 'mysqltest.sample.key', 'owner_type' => 'galaxy',
            'owner_id' => $organizationId, 'value_json' => '"x"', 'version' => 1,
        ]));

        // CHECK: type / sensitivity domains on definitions.
        $this->assertQueryFails(fn () => CoreSettingDefinition::query()->create([
            'key' => 'mysqltest.bad.type', 'title' => 'Bad', 'type' => 'float',
            'default_value' => null, 'allowed_scopes' => ['user'], 'constraints' => null,
            'inheritance' => 'none', 'owner' => 'core', 'sensitivity' => 'internal',
            'version' => 1, 'fingerprint' => str_repeat('b', 64),
        ]));

        // RESTRICT: a definition with stored values cannot be deleted.
        $this->assertQueryFails(fn () => $definition->delete());

        // Policies: unique per (organization, key) + RESTRICT org delete.
        DB::table('core_setting_override_policies')->insert([
            'organization_id' => $organizationId, 'setting_key' => 'mysqltest.sample.key',
            'allow_workspace_override' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertQueryFails(fn () => DB::table('core_setting_override_policies')->insert([
            'organization_id' => $organizationId, 'setting_key' => 'mysqltest.sample.key',
            'allow_workspace_override' => false, 'created_at' => now(), 'updated_at' => now(),
        ]));
        $this->assertQueryFails(fn () => DB::table('organizations')->where('id', $organizationId)->delete());

        // Rollback: a failing sync leaves the definitions table untouched.
        $countBefore = CoreSettingDefinition::query()->count();
        try {
            DB::transaction(function (): void {
                CoreSettingDefinition::query()->create([
                    'key' => 'mysqltest.rollback.key', 'title' => 'Rollback', 'type' => 'string',
                    'default_value' => null, 'allowed_scopes' => ['user'], 'constraints' => null,
                    'inheritance' => 'none', 'nullable' => true, 'owner' => 'core',
                    'sensitivity' => 'internal', 'version' => 1, 'fingerprint' => str_repeat('c', 64),
                ]);
                throw new RuntimeException('abort');
            });
            $this->fail('Expected the transaction to abort.');
        } catch (RuntimeException) {
            // expected
        }
        $this->assertSame($countBefore, CoreSettingDefinition::query()->count());
    }

    private function assertQueryFails(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Expected QueryException.');
        } catch (QueryException) {
            $this->assertTrue(true);
        }
    }
}
