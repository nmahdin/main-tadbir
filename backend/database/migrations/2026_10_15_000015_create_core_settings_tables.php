<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Scoped settings foundation (Stage C7-1).
     *
     * Three tables:
     *  - core_setting_definitions: the persisted mirror of the
     *    code-defined registry (SettingsRegistry). Stable unique
     *    key; synchronization is fill-the-gaps + loud drift errors,
     *    never silent overwrites.
     *  - core_setting_values: explicit non-secret overrides per
     *    owner. Unique (owner_type, owner_id, setting_key). A row's
     *    EXISTENCE is the override; value_json holds the JSON-encoded
     *    typed value, where 'null' is an explicitly-null override —
     *    distinguishable from an absent row. owner_id is a
     *    polymorphic reference (organization/workspace/user) and is
     *    deliberately NOT a database FK — no single FK target
     *    exists; owner existence and scope eligibility are enforced
     *    by the setting store. setting_key IS a real FK to the
     *    definitions table (RESTRICT: definitions never disappear
     *    under stored values).
     *  - core_setting_override_policies: Organization-level per-key
     *    permission for Workspace overrides. Missing policy rows
     *    fall back to the definition's declared default (default
     *    false = deny); nothing here grants anything broadly.
     *
     * Secret values NEVER enter core_setting_values (the store
     * rejects secret-sensitivity definitions); secret storage is
     * C7-3's dedicated design. Revision history is likewise C7-3.
     *
     * Compatibility: organizations.settings (legacy JSON incl. the
     * settings.public block read by the C6 invitation presenter)
     * is untouched by this migration and remains the sole writable
     * source for that legacy metadata in C7-1; the registry records
     * the canonical keys and their legacy source for the C7-2
     * migration of writes. No existing data is renamed, moved, or
     * overwritten.
     */
    public function up(): void
    {
        Schema::create('core_setting_definitions', function (Blueprint $table) {
            $table->id();
            $table->string('key', 120)->unique();
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->string('type', 20);
            $table->json('default_value')->nullable();
            $table->json('allowed_scopes');
            $table->json('constraints')->nullable();
            $table->string('inheritance', 30)->default('none');
            $table->boolean('workspace_override')->default(false);
            $table->boolean('user_override')->default(false);
            $table->boolean('workspace_override_default')->default(false);
            $table->boolean('mandatory')->default(false);
            $table->boolean('nullable')->default(false);
            $table->string('owner', 60)->default('core');
            $table->string('sensitivity', 20)->default('internal');
            $table->unsignedInteger('version')->default(1);
            $table->char('fingerprint', 64);
            $table->timestamps();
        });

        Schema::create('core_setting_values', function (Blueprint $table) {
            $table->id();
            $table->string('setting_key', 120);
            $table->string('owner_type', 20);
            $table->unsignedBigInteger('owner_id');
            $table->text('value_json');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['owner_type', 'owner_id', 'setting_key'], 'core_setting_values_owner_key_unique');
            $table->index('setting_key');
            $table->foreign('setting_key')->references('key')->on('core_setting_definitions')->restrictOnDelete();
        });

        Schema::create('core_setting_override_policies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->string('setting_key', 120);
            $table->boolean('allow_workspace_override')->default(false);
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'setting_key'], 'core_setting_policies_org_key_unique');
            $table->foreign('setting_key')->references('key')->on('core_setting_definitions')->restrictOnDelete();
        });

        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE core_setting_definitions ADD CONSTRAINT core_setting_definitions_type_check CHECK (type IN ('string','boolean','integer','enum','timezone','locale','json'))");
            DB::statement("ALTER TABLE core_setting_definitions ADD CONSTRAINT core_setting_definitions_inheritance_check CHECK (inheritance IN ('none','organization_to_workspace'))");
            DB::statement("ALTER TABLE core_setting_definitions ADD CONSTRAINT core_setting_definitions_sensitivity_check CHECK (sensitivity IN ('public','internal','secret'))");
            DB::statement("ALTER TABLE core_setting_values ADD CONSTRAINT core_setting_values_owner_type_check CHECK (owner_type IN ('organization','workspace','user'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_setting_override_policies');
        Schema::dropIfExists('core_setting_values');
        Schema::dropIfExists('core_setting_definitions');
    }
};
