<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Stage C5-4 — plan changes are recorded as their own immutable
 * subscription period operation. Widens the MySQL CHECK on
 * core_subscription_periods.operation to include 'plan_change'
 * (SQLite never had the CHECK, per repository convention).
 * Historical rows are untouched.
 *
 * CHECK removal syntax differs by SERVER engine (MySQL
 * `DROP CHECK`, MariaDB `DROP CONSTRAINT`); the engine is read
 * from the server version string because Laravel's PDO driver
 * name is `mysql` for both servers. (Compatibility correction —
 * same migration identity; see 000006 for the shared pattern.)
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->dropCheckConstraint('core_subscription_periods', 'core_subscription_periods_operation_check');
        $this->addCheckConstraint('core_subscription_periods', 'core_subscription_periods_operation_check', "operation IN ('initial', 'renewal', 'plan_change')");
    }

    public function down(): void
    {
        $this->dropCheckConstraint('core_subscription_periods', 'core_subscription_periods_operation_check');
        $this->addCheckConstraint('core_subscription_periods', 'core_subscription_periods_operation_check', "operation IN ('initial', 'renewal')");
    }

    private function dropCheckConstraint(string $table, string $constraint): void
    {
        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }
        if (! $this->checkConstraintExists($table, $constraint)) {
            return;
        }
        $syntax = $this->serverIsMariaDb() ? 'DROP CONSTRAINT' : 'DROP CHECK';
        DB::statement("ALTER TABLE {$table} {$syntax} {$constraint}");
    }

    private function addCheckConstraint(string $table, string $constraint, string $expression): void
    {
        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }
        if ($this->checkConstraintExists($table, $constraint)) {
            return;
        }
        DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$constraint} CHECK ({$expression})");
    }

    private function checkConstraintExists(string $table, string $constraint): bool
    {
        return DB::table('information_schema.TABLE_CONSTRAINTS')
            ->where('CONSTRAINT_SCHEMA', DB::connection()->getDatabaseName())
            ->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $constraint)
            ->where('CONSTRAINT_TYPE', 'CHECK')
            ->exists();
    }

    private function serverIsMariaDb(): bool
    {
        $row = DB::selectOne('SELECT VERSION() AS version');

        return str_contains(strtolower((string) ($row->version ?? '')), 'mariadb');
    }
};
