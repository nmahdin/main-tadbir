<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * C5-M2-S3 acceptance corrections:
     *   1. Switch quote owner foreign keys from ON DELETE SET NULL to
     *      ON DELETE RESTRICT (matching core_subscriptions precedent)
     *      so hard-deleting an organization or personal workspace
     *      that still owns an immutable financial snapshot is
     *      rejected by the database. Prevents financially-ambiguous
     *      orphaned quotes.
     *   2. Insert a sentinel lock row (id=-1) into core_tax_rules
     *      used by TaxRuleService to serialize concurrent tax-rule
     *      activation (Q3=A "at most one active" invariant).
     *
     * Additive (no destructive changes; no data migration).
     * MariaDB 10.4 / MySQL / SQLite safe.
     */
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $dbName = DB::connection()->getDatabaseName();
            $fks = DB::select(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'core_billing_quotes'
                 AND COLUMN_NAME IN ('organization_id','personal_workspace_id')
                 AND REFERENCED_TABLE_NAME IS NOT NULL",
                [$dbName]
            );
            foreach ($fks as $fk) {
                $name = $fk->CONSTRAINT_NAME;
                DB::statement("ALTER TABLE core_billing_quotes DROP FOREIGN KEY `{$name}`");
            }

            Schema::table('core_billing_quotes', function (Blueprint $table) {
                $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
                $table->foreign('personal_workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            });
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("INSERT IGNORE INTO core_tax_rules
                (id, label, rate_basis_points, is_active, created_at, updated_at)
                VALUES (-1, '__sentinel_lock__', 0, 0, NOW(), NOW())");
        } else {
            DB::statement("INSERT OR IGNORE INTO core_tax_rules
                (id, label, rate_basis_points, is_active, created_at, updated_at)
                VALUES (-1, '__sentinel_lock__', 0, 0, datetime('now'), datetime('now'))");
        }
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();

        DB::table('core_tax_rules')->where('id', -1)->delete();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $dbName = DB::connection()->getDatabaseName();
            $fks = DB::select(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'core_billing_quotes'
                 AND COLUMN_NAME IN ('organization_id','personal_workspace_id')
                 AND REFERENCED_TABLE_NAME IS NOT NULL",
                [$dbName]
            );
            foreach ($fks as $fk) {
                $name = $fk->CONSTRAINT_NAME;
                DB::statement("ALTER TABLE core_billing_quotes DROP FOREIGN KEY `{$name}`");
            }

            Schema::table('core_billing_quotes', function (Blueprint $table) {
                $table->foreign('organization_id')->references('id')->on('organizations')->nullOnDelete();
                $table->foreign('personal_workspace_id')->references('id')->on('workspaces')->nullOnDelete();
            });
        }
    }
};
