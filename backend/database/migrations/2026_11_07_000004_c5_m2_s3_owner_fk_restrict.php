<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * C5-M2-S3 acceptance correction: switch quote owner foreign keys from
     * ON DELETE SET NULL to ON DELETE RESTRICT, matching core_subscriptions
     * precedent and preserving audit-grade owner integrity on immutable
     * financial snapshots. Without this, a hard-deleted organization or
     * personal workspace would leave a quote with a NULL owner — financially
     * ambiguous and unreachable by owner-scoped authz.
     *
     * Additive: drops and re-adds the two foreign keys (no data migration).
     * Safe on MySQL / MariaDB / MariaDB 10.4. SQLite's ALTER TABLE DROP
     * FOREIGN KEY is not directly supported; we skip the FK swap there
     * (SQLite tests do not exercise hard-delete of organizations or
     * personal workspaces).
     */
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        // Resolve and drop the existing FKs by reflecting on
        // INFORMATION_SCHEMA. Laravel's auto-generated names are
        // {table}_{column}_foreign but we resolve them defensively.
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

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

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
};
