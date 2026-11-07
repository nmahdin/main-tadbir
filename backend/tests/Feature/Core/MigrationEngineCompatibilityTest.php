<?php

namespace Tests\Feature\Core;

use Tests\TestCase;

/**
 * MariaDB/MySQL migration-compatibility guards (runs everywhere,
 * including SQLite): the DROP-CHECK fix must stay server-engine
 * aware. On real engines the behavior is proven by
 * PlatformSchemaMysqlTest in BOTH the MySQL and MariaDB CI jobs;
 * this test pins the source pattern so a future edit cannot
 * silently reintroduce PDO-driver-name selection or an
 * unconditional MySQL-only statement.
 */
class MigrationEngineCompatibilityTest extends TestCase
{
    /**
     * Migrations that remove a CHECK constraint (the only place
     * MySQL and MariaDB grammar differ in this codebase).
     *
     * @var list<string>
     */
    private const CHECK_DROPPING_MIGRATIONS = [
        '2026_10_15_000006_create_platform_administration_tables.php',
        '2026_10_15_000008_add_organization_lifecycle_fields.php',
        '2026_10_15_000012_allow_plan_change_periods.php',
    ];

    public function test_check_dropping_migrations_select_syntax_by_server_engine(): void
    {
        foreach (self::CHECK_DROPPING_MIGRATIONS as $file) {
            $source = (string) file_get_contents(database_path('migrations/'.$file));
            $this->assertStringContainsString('SELECT VERSION() AS version', $source, "{$file} must read the server version");
            $this->assertStringContainsString("'mariadb'", $source, "{$file} must branch on the MariaDB engine marker");
            $this->assertStringContainsString('DROP CONSTRAINT', $source, "{$file} must support MariaDB grammar");
            $this->assertStringContainsString('information_schema.TABLE_CONSTRAINTS', $source, "{$file} must be existence-guarded for partial states");
        }
    }

    public function test_no_migration_issues_an_unconditional_mysql_only_drop_check(): void
    {
        $files = glob(database_path('migrations/*.php')) ?: [];
        $this->assertNotEmpty($files);
        foreach ($files as $path) {
            $source = (string) file_get_contents($path);
            $this->assertSame(
                0,
                preg_match("/DB::statement\(\s*['\"]ALTER TABLE[^'\"]*DROP CHECK/", $source),
                basename($path).' issues DROP CHECK unconditionally (MariaDB rejects it)',
            );
        }
    }

    public function test_check_constraints_are_never_disabled_for_compatibility(): void
    {
        foreach (self::CHECK_DROPPING_MIGRATIONS as $file) {
            $source = (string) file_get_contents(database_path('migrations/'.$file));
            // The fix must re-ADD the intended constraint and must
            // never switch the server to a permissive mode.
            $this->assertStringContainsString('ADD CONSTRAINT', $source, "{$file} must restore the intended CHECK");
            $this->assertStringNotContainsString('FOREIGN_KEY_CHECKS', $source);
            $this->assertStringNotContainsString('SQL_MODE', $source);
        }
    }

    /**
     * MariaDB legacy TIMESTAMP incident: business dates that the
     * application always populates explicitly must be DATETIME.
     * A bare TIMESTAMP gets an implicit zero-date (rejected,
     * 1067) or CURRENT_TIMESTAMP/ON UPDATE default under
     * explicit_defaults_for_timestamp=OFF.
     */
    public function test_business_dates_use_datetime_not_bare_timestamps(): void
    {
        $expectations = [
            '2026_10_15_000011_create_subscription_tables.php' => ['starts_at', 'expires_at', 'grace_ends_at', 'effective_starts_at'],
            '2026_10_15_000013_create_invitations_table.php' => ['expires_at'],
            '2026_10_15_000014_add_verified_email_identity.php' => ['expires_at'],
        ];
        foreach ($expectations as $file => $columns) {
            $source = (string) file_get_contents(database_path('migrations/'.$file));
            foreach ($columns as $column) {
                $this->assertStringContainsString("dateTime('{$column}')", $source, "{$file}: {$column} must be DATETIME");
                $this->assertSame(
                    0,
                    preg_match("/->timestamp\\('".preg_quote($column, '/')."'\\);/", $source),
                    "{$file}: {$column} must not be a bare TIMESTAMP",
                );
            }
            // Strictness must never be relaxed as a workaround:
            // neither the server mode nor the timestamp-default
            // behavior may be SET by a migration.
            $this->assertSame(0, preg_match('/SET\s+[^;]*explicit_defaults_for_timestamp/i', $source), "{$file} must not change explicit_defaults_for_timestamp");
            $this->assertSame(0, preg_match('/SET\s+[^;]*SQL_MODE/i', $source), "{$file} must not change SQL_MODE");
        }
    }
}
