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
        $isMysql = in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);

        Schema::create('organizations', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('status', 20)->default('active');
            $table->json('settings')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // On MySQL the owner/membership foreign keys are added only after
        // the generated discriminator columns exist: InnoDB rejects
        // ADD COLUMN ... GENERATED on tables whose referenced columns
        // already carry foreign keys (error 1215, verified in CI run
        // 38709239239). SQLite cannot add foreign keys via ALTER, so
        // there the constraints stay inline in CREATE TABLE, which
        // SQLite accepts together with later generated columns.
        Schema::create('workspaces', function (Blueprint $table) use ($isMysql): void {
            $table->id();
            $table->string('name');
            $ownerUser = $table->foreignId('owner_user_id')->nullable();
            $ownerOrganization = $table->foreignId('organization_id')->nullable();
            if (! $isMysql) {
                $ownerUser->constrained('users')->restrictOnDelete();
                $ownerOrganization->constrained('organizations')->restrictOnDelete();
            }
            $table->boolean('is_default')->default(false);
            $table->string('status', 20)->default('active');
            $table->timestamps();

            $table->index(['owner_user_id', 'status']);
            $table->index(['organization_id', 'status']);
        });

        Schema::create('organization_memberships', function (Blueprint $table) use ($isMysql): void {
            $table->id();
            $organization = $table->foreignId('organization_id');
            $user = $table->foreignId('user_id');
            if (! $isMysql) {
                $organization->constrained()->cascadeOnDelete();
                $user->constrained('users')->cascadeOnDelete();
            }
            $table->string('status', 20)->default('active');
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status']);
            $table->index(['user_id', 'status']);
        });

        Schema::create('workspace_memberships', function (Blueprint $table) use ($isMysql): void {
            $table->id();
            $workspace = $table->foreignId('workspace_id');
            $user = $table->foreignId('user_id');
            if (! $isMysql) {
                $workspace->constrained()->cascadeOnDelete();
                $user->constrained('users')->cascadeOnDelete();
            }
            $table->string('status', 20)->default('active');
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'status']);
            $table->index(['user_id', 'status']);
        });

        $this->addPortableConstraints($isMysql);

        if ($isMysql) {
            $this->addForeignKeysAfterGeneratedColumns();
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_memberships');
        Schema::dropIfExists('organization_memberships');
        Schema::dropIfExists('workspaces');
        Schema::dropIfExists('organizations');
    }

    private function addForeignKeysAfterGeneratedColumns(): void
    {
        Schema::table('workspaces', function (Blueprint $table): void {
            $table->foreign('owner_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
        });

        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('workspace_memberships', function (Blueprint $table): void {
            $table->foreign('workspace_id')->references('id')->on('workspaces')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    private function addPortableConstraints(bool $isMysql): void
    {
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
