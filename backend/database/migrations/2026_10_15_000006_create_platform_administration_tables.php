<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C2-1 — platform administration schema (additive only).
 *
 * Creates the platform-scope RBAC tables, deliberately separate
 * from the organization/workspace machinery (`core_roles` cannot
 * hold platform roles: its scope-container CHECK and generated
 * owner discriminator assume exactly one scope container):
 *
 *  - platform_roles: global, database-managed platform roles. The
 *    protected `primary_administrator` role is provisioned by code
 *    (PlatformRoleProvisioner), never assigned by this migration.
 *  - platform_role_permissions: composite-PK pivot with RESTRICT
 *    referential integrity (a deliberate deviation from
 *    core_role_permissions' CASCADE: deleting a role or permission
 *    that is still referenced must fail, not silently unlink).
 *    The schema cannot enforce that only platform-scope
 *    permissions are attached; that rule is enforced by domain
 *    services via PermissionCatalog::assertKnownKeysForScope().
 *  - platform_role_assignments: at most one ACTIVE platform role
 *    per user, enforced by the generated `active_user_id` column +
 *    unique index (the Stage 03A/03B discriminator technique).
 *    Revocation is soft (`revoked_at`); history rows are retained.
 *  - platform_administration_control: singleton row (id = 1) for
 *    transaction serialization and bootstrap state. No API may
 *    modify it.
 *
 * Step order in up() matters: the MySQL `core_permissions` scope
 * CHECK (created in 2026_10_15_000002) is widened FIRST, before
 * anything can synchronize platform-scope permission rows.
 *
 * MySQL DDL auto-commits per statement, so a failure mid-migration
 * leaves an enumerable partial state: detect it with
 * `migrate:status` plus information_schema (the four tables, the
 * generated column, both unique indexes, the CHECK definition),
 * remove or complete the partial objects manually, then re-run.
 * This migration intentionally performs no silent structural
 * "repair" of incompatible partial state.
 *
 * Deployment assumption: MySQL >= 8.0.16 (enforced CHECK
 * constraints; generated columns need >= 5.7). MariaDB >= 10.2 is
 * supported for local development: CHECK removal syntax differs
 * by SERVER engine (MySQL `DROP CHECK`, MariaDB `DROP
 * CONSTRAINT`), and Laravel's PDO driver name is `mysql` for both
 * servers, so the migrations detect the engine from the server
 * version string and only drop/add a CHECK that
 * information_schema shows in the expected state — a re-run
 * after a partially applied DDL failure passes the widening step
 * instead of failing on the already-widened CHECK (the remaining
 * objects still fail loudly, as documented above).
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->widenPermissionScopeCheck();

        Schema::create('platform_roles', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 80)->unique();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->boolean('is_protected')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('platform_role_permissions', function (Blueprint $table): void {
            $table->foreignId('platform_role_id')->constrained('platform_roles')->restrictOnDelete();
            $table->foreignId('permission_id')->constrained('core_permissions')->restrictOnDelete();
            $table->primary(['platform_role_id', 'permission_id']);
        });

        Schema::create('platform_role_assignments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('platform_role_id')->constrained('platform_roles')->restrictOnDelete();
            $table->foreignId('granted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('revoked_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'revoked_at']);
            $table->index(['platform_role_id', 'revoked_at']);
        });

        $this->addActiveAssignmentConstraint();

        Schema::create('platform_administration_control', function (Blueprint $table): void {
            // Not auto-increment: MySQL forbids CHECK constraints on
            // AUTO_INCREMENT columns (error 3818), and the singleton
            // row must carry the fixed id 1.
            $table->unsignedBigInteger('id')->primary();
            $table->timestamp('bootstrap_completed_at')->nullable();
            $table->foreignId('bootstrapped_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        $this->addSingletonConstraint();

        DB::table('platform_administration_control')->insert(['id' => 1, 'created_at' => now(), 'updated_at' => now()]);
    }

    /**
     * Non-destructive rollback: when assignment history or bootstrap
     * state exists, rollback is refused and nothing is changed.
     * Only a never-used platform schema may be rolled back; in that
     * case dependent rows are removed BEFORE the scope CHECK is
     * narrowed again (the reverse order would fail on MySQL).
     */
    public function down(): void
    {
        if (Schema::hasTable('platform_role_assignments')
            && DB::table('platform_role_assignments')->exists()) {
            throw new RuntimeException('C2-1 rollback refused: platform assignment history exists.');
        }

        if (Schema::hasTable('platform_administration_control')
            && DB::table('platform_administration_control')->whereNotNull('bootstrap_completed_at')->exists()) {
            throw new RuntimeException('C2-1 rollback refused: platform bootstrap has completed.');
        }

        Schema::dropIfExists('platform_role_assignments');
        Schema::dropIfExists('platform_role_permissions');
        Schema::dropIfExists('platform_roles');
        Schema::dropIfExists('platform_administration_control');

        DB::table('core_permissions')->where('scope', 'platform')->delete();
        $this->restorePermissionScopeCheck();
    }

    private function widenPermissionScopeCheck(): void
    {
        $this->dropCheckConstraint('core_permissions', 'core_permissions_scope_check');
        $this->addCheckConstraint('core_permissions', 'core_permissions_scope_check', "scope IN ('organization', 'workspace', 'platform')");
    }

    private function restorePermissionScopeCheck(): void
    {
        $this->dropCheckConstraint('core_permissions', 'core_permissions_scope_check');
        $this->addCheckConstraint('core_permissions', 'core_permissions_scope_check', "scope IN ('organization', 'workspace')");
    }

    /**
     * CHECK removal is the one place where MySQL and MariaDB
     * grammar differ (`DROP CHECK` vs `DROP CONSTRAINT`). Pick by
     * the actual server engine: `VERSION()` reports MariaDB
     * servers as e.g. `10.11.x-MariaDB`, while the PDO driver
     * name stays `mysql` for both under Laravel's default
     * connection. Drops/adds are existence-guarded through
     * information_schema so a partially applied state (DDL
     * auto-commits) can be resumed deterministically.
     */
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

    /**
     * One active platform assignment per user: revoked rows produce
     * NULL and never collide in the unique index on either engine.
     */
    private function addActiveAssignmentConstraint(): void
    {
        $isMysql = in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
        $intType = $isMysql ? 'BIGINT UNSIGNED' : 'INTEGER';
        $stored = $isMysql ? 'STORED' : 'VIRTUAL';

        DB::statement("ALTER TABLE platform_role_assignments ADD COLUMN active_user_id {$intType} GENERATED ALWAYS AS (CASE WHEN revoked_at IS NULL THEN user_id ELSE NULL END) {$stored}");
        DB::statement('CREATE UNIQUE INDEX platform_role_assignments_active_user_unique ON platform_role_assignments (active_user_id)');
    }

    private function addSingletonConstraint(): void
    {
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE platform_administration_control ADD CONSTRAINT platform_administration_control_singleton_check CHECK (id = 1)');
        }
    }
};
