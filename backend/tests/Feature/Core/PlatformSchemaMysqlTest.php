<?php

namespace Tests\Feature\Core;

use App\Core\Platform\PlatformRole;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Stage C2-1 — MySQL-only schema evidence.
 *
 * SQLite cannot prove enforced CHECK constraints or InnoDB
 * generated-column behavior, so these tests are SKIPPED off MySQL
 * and nothing about MySQL is claimed from SQLite runs. They run in
 * the CI MySQL job against the disposable test database after
 * `migrate:fresh` (no RefreshDatabase: fixtures are committed and
 * cleaned up explicitly, and the upgrade/partial-state scenarios
 * deliberately re-run the C2-1 migration file itself).
 */
class PlatformSchemaMysqlTest extends TestCase
{
    private const MIGRATION = '2026_10_15_000006_create_platform_administration_tables';

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only schema test (SQLite cannot enforce CHECK/generated-column semantics).');
        }

        PermissionCatalog::sync();
    }

    public function test_platform_permissions_synchronize_and_scope_check_rejects_invalid_scopes(): void
    {
        foreach (PermissionCatalog::keysForScope(PermissionCatalog::SCOPE_PLATFORM) as $key) {
            $this->assertDatabaseHas('core_permissions', ['key' => $key, 'scope' => 'platform']);
        }

        try {
            DB::table('core_permissions')->insert([
                'key' => 'bogus.scope.test',
                'scope' => 'bogus',
                'name' => 'Bogus',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('The MySQL scope CHECK must reject invalid scope values.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_generated_column_enforces_one_active_assignment_on_mysql(): void
    {
        $role = PlatformRole::create(['key' => 'mysql_test_role', 'name' => 'MySQL Test']);
        $user = User::factory()->create();

        try {
            DB::table('platform_role_assignments')->insert([
                'user_id' => $user->id, 'platform_role_id' => $role->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('platform_role_assignments')->insert([
                'user_id' => $user->id, 'platform_role_id' => $role->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->fail('A second active assignment must violate the generated-column unique index.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        } finally {
            DB::table('platform_role_assignments')->where('user_id', $user->id)->delete();
            DB::table('platform_roles')->where('id', $role->id)->delete();
            DB::table('users')->where('id', $user->id)->delete();
        }
    }

    public function test_control_singleton_check_rejects_other_ids_on_mysql(): void
    {
        $this->assertDatabaseHas('platform_administration_control', ['id' => 1]);

        try {
            DB::table('platform_administration_control')->insert(['id' => 2, 'created_at' => now(), 'updated_at' => now()]);
            $this->fail('The singleton CHECK (id = 1) must reject other control rows.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_c1_schema_upgrades_to_c2_1_and_partial_state_fails_loudly(): void
    {
        $this->simulatePreC21Schema();

        // Partial/incompatible state must fail loudly, never be
        // silently accepted: a structurally wrong platform_roles
        // table makes the migration error out.
        Schema::create('platform_roles', function ($table): void {
            $table->id();
        });
        try {
            $failed = false;
            try {
                Artisan::call('migrate', [
                    '--path' => database_path('migrations/'.self::MIGRATION.'.php'),
                    '--realpath' => true,
                    '--force' => true,
                ]);
            } catch (\Throwable) {
                $failed = true;
            }
            $this->assertTrue($failed, 'Migration must fail loudly on incompatible partial state.');
        } finally {
            Schema::dropIfExists('platform_roles');
        }

        // After removing the partial object, the real upgrade runs.
        Artisan::call('migrate', [
            '--path' => database_path('migrations/'.self::MIGRATION.'.php'),
            '--realpath' => true,
            '--force' => true,
        ]);

        $this->assertTrue(Schema::hasTable('platform_role_assignments'));
        $this->assertTrue(Schema::hasColumn('platform_role_assignments', 'active_user_id'));
        $this->assertDatabaseHas('platform_administration_control', ['id' => 1]);
        PermissionCatalog::sync();
        $this->assertDatabaseHas('core_permissions', ['key' => 'platform.audit.view', 'scope' => 'platform']);
    }

    public function test_widened_check_clauses_match_the_intended_contracts(): void
    {
        // The exact intended constraints survived migration on this
        // engine (MySQL or MariaDB — these tests run on both in CI):
        // nothing was disabled or silently dropped to get here.
        $scopeClause = $this->checkClause('core_permissions', 'core_permissions_scope_check');
        $this->assertNotNull($scopeClause);
        $this->assertStringContainsString('platform', (string) $scopeClause);

        $periodsClause = $this->checkClause('core_subscription_periods', 'core_subscription_periods_operation_check');
        $this->assertNotNull($periodsClause);
        $this->assertStringContainsString('plan_change', (string) $periodsClause);

        $organizationsClause = $this->checkClause('organizations', 'organizations_status_check');
        $this->assertNotNull($organizationsClause);
        $this->assertStringContainsString('suspended', (string) $organizationsClause);
    }

    public function test_plan_change_periods_check_round_trip_on_this_engine(): void
    {
        $migration = require database_path('migrations/2026_10_15_000012_allow_plan_change_periods.php');
        try {
            $migration->down();
            $narrowed = $this->checkClause('core_subscription_periods', 'core_subscription_periods_operation_check');
            $this->assertNotNull($narrowed);
            $this->assertStringNotContainsString('plan_change', (string) $narrowed);
        } finally {
            $migration->up();
        }
        $widened = $this->checkClause('core_subscription_periods', 'core_subscription_periods_operation_check');
        $this->assertStringContainsString('plan_change', (string) $widened);
    }

    public function test_resume_when_scope_check_was_already_widened_by_partial_run(): void
    {
        // Partial state left by a statement-level DDL failure AFTER
        // the widening committed (DDL auto-commits): platform
        // tables absent, migration unrecorded, CHECK already wide.
        // The fixed migration must pass the widening step and
        // complete instead of dying on the already-widened CHECK.
        $this->simulatePreC21Schema();
        $this->widenScopeCheck();

        Artisan::call('migrate', [
            '--path' => database_path('migrations/'.self::MIGRATION.'.php'),
            '--realpath' => true,
            '--force' => true,
        ]);

        $this->assertTrue(Schema::hasTable('platform_role_assignments'));
        $this->assertDatabaseHas('platform_administration_control', ['id' => 1]);
        PermissionCatalog::sync();
        $this->assertDatabaseHas('core_permissions', ['key' => 'platform.audit.view', 'scope' => 'platform']);
    }

    /**
     * Return the disposable CI database to its pre-C2-1 (post-C1)
     * shape: platform tables dropped, platform permission rows
     * removed, the original two-value scope CHECK restored, and the
     * migration marked as not yet run.
     */
    private function simulatePreC21Schema(): void
    {
        Schema::dropIfExists('platform_role_assignments');
        Schema::dropIfExists('platform_role_permissions');
        Schema::dropIfExists('platform_roles');
        Schema::dropIfExists('platform_administration_control');
        DB::table('core_permissions')->where('scope', 'platform')->delete();
        $this->dropScopeCheck();
        DB::statement("ALTER TABLE core_permissions ADD CONSTRAINT core_permissions_scope_check CHECK (scope IN ('organization', 'workspace'))");
        DB::table('migrations')->where('migration', self::MIGRATION)->delete();
    }

    private function widenScopeCheck(): void
    {
        $this->dropScopeCheck();
        DB::statement("ALTER TABLE core_permissions ADD CONSTRAINT core_permissions_scope_check CHECK (scope IN ('organization', 'workspace', 'platform'))");
    }

    /**
     * Engine-correct CHECK removal for test simulations: MySQL
     * grammar is `DROP CHECK`, MariaDB grammar is
     * `DROP CONSTRAINT`, and the PDO driver name is `mysql` for
     * both servers, so read the engine from VERSION().
     */
    private function dropScopeCheck(): void
    {
        $row = DB::selectOne('SELECT VERSION() AS version');
        $syntax = str_contains(strtolower((string) ($row->version ?? '')), 'mariadb') ? 'DROP CONSTRAINT' : 'DROP CHECK';
        DB::statement("ALTER TABLE core_permissions {$syntax} core_permissions_scope_check");
    }

    private function checkClause(string $table, string $constraint): ?string
    {
        $row = DB::selectOne(
            'SELECT cc.CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS cc '
            .'JOIN information_schema.TABLE_CONSTRAINTS tc '
            .'ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME '
            .'WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.TABLE_NAME = ? AND tc.CONSTRAINT_NAME = ?',
            [DB::connection()->getDatabaseName(), $table, $constraint],
        );

        return $row !== null ? (string) $row->clause : null;
    }
}
