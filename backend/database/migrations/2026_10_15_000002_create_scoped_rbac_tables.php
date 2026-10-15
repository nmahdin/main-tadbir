<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 03B — scoped RBAC foundation (additive only).
 *
 * Creates the Core-owned scoped authorization tables and attaches a
 * nullable role reference to the Stage 03A membership tables:
 *  - core_permissions: rows materialized from App\Core\Rbac\PermissionCatalog
 *    (the code catalog is canonical; this table is its database mirror,
 *    never a second writable catalog);
 *  - core_roles: organization- or workspace-scoped roles. Exactly one
 *    scope container (organization_id XOR workspace_id) is set, matching
 *    the declared scope;
 *  - core_role_permissions: role <-> permission assignments;
 *  - workspace_memberships.role_id / organization_memberships.role_id:
 *    a membership's single scoped role. Nullable at the schema level so
 *    historical/ended rows can exist; the domain services guarantee
 *    every ACTIVE membership holds exactly one scope-matching role.
 *
 * Legacy roles/permissions tables are untouched and remain authoritative
 * for unmigrated modules; their replacement is the Stage 04 cutover
 * (ADR-0004). The memberships user foreign keys stay RESTRICT (03A), so
 * role references use restrictOnDelete as well: a role in use is never
 * removed silently (the domain layer additionally refuses deletion of
 * protected roles and of roles assigned to live memberships).
 *
 * Engine notes (ADR-0009): key/scope integrity that InnoDB can express
 * (scope-container match for roles, unique discriminator for per-owner
 * role keys) is declared for MySQL; the same generated-discriminator
 * technique already proven in Stage 03A is used on both engines for
 * uniqueness. On SQLite the scope-container match is enforced by the
 * ScopedRole model + tests (SQLite cannot add a CHECK via ALTER, and
 * this stage performs no destructive table rebuild — same documented
 * non-equivalence class as the workspace XOR, Stage 03A report §3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_permissions', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->string('scope', 20);
            $table->string('name');
            $table->timestamps();

            $table->index(['scope', 'key']);
        });

        Schema::create('core_roles', function (Blueprint $table): void {
            $table->id();
            $table->string('scope', 20);
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->foreignId('workspace_id')->nullable()->constrained('workspaces')->restrictOnDelete();
            $table->string('key');
            $table->string('name');
            $table->boolean('is_protected')->default(false);
            $table->timestamps();

            $table->index(['scope', 'organization_id']);
            $table->index(['scope', 'workspace_id']);
        });

        Schema::create('core_role_permissions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('role_id')->constrained('core_roles')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('core_permissions')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['role_id', 'permission_id']);
        });

        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->foreignId('role_id')->nullable()->after('user_id')
                ->constrained('core_roles')->restrictOnDelete();
        });

        Schema::table('workspace_memberships', function (Blueprint $table): void {
            $table->foreignId('role_id')->nullable()->after('user_id')
                ->constrained('core_roles')->restrictOnDelete();
        });

        $this->addScopeConstraints();
    }

    public function down(): void
    {
        Schema::table('workspace_memberships', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('role_id');
        });

        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('role_id');
        });

        Schema::dropIfExists('core_role_permissions');
        Schema::dropIfExists('core_roles');
        Schema::dropIfExists('core_permissions');
    }

    private function addScopeConstraints(): void
    {
        $isMysql = in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
        $intType = $isMysql ? 'BIGINT UNSIGNED' : 'INTEGER';
        $stored = $isMysql ? 'STORED' : 'VIRTUAL';

        if ($isMysql) {
            DB::statement("ALTER TABLE core_roles ADD CONSTRAINT core_roles_scope_container_check CHECK ((scope = 'workspace' AND workspace_id IS NOT NULL AND organization_id IS NULL) OR (scope = 'organization' AND organization_id IS NOT NULL AND workspace_id IS NULL))");
            DB::statement("ALTER TABLE core_permissions ADD CONSTRAINT core_permissions_scope_check CHECK (scope IN ('organization', 'workspace'))");
        }

        // One role key per scope owner (portable replacement for partial
        // unique indexes over nullable container columns).
        DB::statement("ALTER TABLE core_roles ADD COLUMN scope_owner_id {$intType} GENERATED ALWAYS AS (CASE WHEN scope = 'workspace' THEN workspace_id WHEN scope = 'organization' THEN organization_id ELSE NULL END) {$stored}");
        DB::statement('CREATE UNIQUE INDEX core_roles_scope_owner_key_unique ON core_roles (scope, scope_owner_id, `key`)');
    }
};
