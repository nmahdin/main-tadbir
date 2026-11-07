<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 03A — Core foundation (additive only).
 *
 * Creates organizations, workspaces, organization_memberships and
 * workspace_memberships. Legacy role/department/team structures are
 * intentionally untouched; workspace-scoped RBAC is Stage 03B.
 *
 * Constraint strategy (ADR-0009): domain validation enforces every rule on
 * every engine. Database-level enforcement is added where the engine
 * supports it:
 *  - Workspace single-owner XOR: CHECK constraint on MySQL/MariaDB.
 *    SQLite cannot add a CHECK via ALTER, and this migration does not
 *    rebuild the table, so on SQLite the XOR is enforced by the Workspace
 *    model + tests (documented non-equivalence, Stage 03A report).
 *  - One default workspace per owner: generated discriminator columns
 *    with a unique index (portable replacement for partial indexes,
 *    which MySQL lacks).
 *  - One live (non-ended) membership per user per organization/workspace:
 *    generated discriminator column with a unique index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('status', 20)->default('active');
            $table->json('settings')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('workspaces', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->boolean('is_default')->default(false);
            $table->string('status', 20)->default('active');
            $table->timestamps();

            $table->index(['owner_user_id', 'status']);
            $table->index(['organization_id', 'status']);
        });

        // The user foreign keys are RESTRICT, not CASCADE: MySQL/InnoDB
        // cannot combine a generated discriminator column that reads
        // user_id with ON DELETE CASCADE on that same column (error
        // 1215 in both statement orders; CI runs 38708563927 and
        // 38709463688). RESTRICT also matches the lifecycle design:
        // memberships are ended explicitly, never silently removed by
        // deleting a user. Organization/workspace deletion still
        // cascades to their memberships.
        Schema::create('organization_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('status', 20)->default('active');
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status']);
            $table->index(['user_id', 'status']);
        });

        Schema::create('workspace_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('status', 20)->default('active');
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'status']);
            $table->index(['user_id', 'status']);
        });

        $this->addPortableConstraints();
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_memberships');
        Schema::dropIfExists('organization_memberships');
        Schema::dropIfExists('workspaces');
        Schema::dropIfExists('organizations');
    }

    private function addPortableConstraints(): void
    {
        $isMysql = in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
        $intType = $isMysql ? 'BIGINT UNSIGNED' : 'INTEGER';
        $stored = $isMysql ? 'STORED' : 'VIRTUAL';

        if ($isMysql) {
            DB::statement('ALTER TABLE workspaces ADD CONSTRAINT workspaces_single_owner_check CHECK ((owner_user_id IS NOT NULL) + (organization_id IS NOT NULL) = 1)');
        }

        DB::statement("ALTER TABLE workspaces ADD COLUMN default_personal_owner_id {$intType} GENERATED ALWAYS AS (CASE WHEN is_default = 1 AND owner_user_id IS NOT NULL THEN owner_user_id ELSE NULL END) {$stored}");
        DB::statement("ALTER TABLE workspaces ADD COLUMN default_organization_id {$intType} GENERATED ALWAYS AS (CASE WHEN is_default = 1 AND organization_id IS NOT NULL THEN organization_id ELSE NULL END) {$stored}");
        DB::statement('CREATE UNIQUE INDEX workspaces_default_personal_owner_unique ON workspaces (default_personal_owner_id)');
        DB::statement('CREATE UNIQUE INDEX workspaces_default_organization_unique ON workspaces (default_organization_id)');

        DB::statement("ALTER TABLE organization_memberships ADD COLUMN live_user_id {$intType} GENERATED ALWAYS AS (CASE WHEN status <> 'ended' THEN user_id ELSE NULL END) {$stored}");
        DB::statement('CREATE UNIQUE INDEX organization_memberships_live_user_unique ON organization_memberships (organization_id, live_user_id)');

        DB::statement("ALTER TABLE workspace_memberships ADD COLUMN live_user_id {$intType} GENERATED ALWAYS AS (CASE WHEN status <> 'ended' THEN user_id ELSE NULL END) {$stored}");
        DB::statement('CREATE UNIQUE INDEX workspace_memberships_live_user_unique ON workspace_memberships (workspace_id, live_user_id)');
    }
};
