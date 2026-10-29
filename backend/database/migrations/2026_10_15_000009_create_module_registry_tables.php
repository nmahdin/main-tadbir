<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C4-1 — module registry persistence.
 *
 * Canonical module definitions live in code (ModuleCatalog) and
 * are synchronized into `core_modules`/`core_module_dependencies`
 * by ModuleRegistrySynchronizer. `workspace_modules` is the
 * per-workspace activation state: absence of a row means the
 * module is disabled, and nothing creates rows at workspace
 * creation time. `organization_module_policies` persists future
 * C4-2 organization policy decisions (absence = no organization
 * restriction recorded). Module rows are protected from deletion
 * while activation/policy state references them (RESTRICT);
 * dependency edges belong to the definition and cascade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_modules', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 80)->unique();
            $table->string('name', 150);
            $table->string('availability', 20)->default('unavailable');
            $table->timestamps();
        });

        Schema::create('core_module_dependencies', function (Blueprint $table): void {
            $table->foreignId('module_id')->constrained('core_modules')->cascadeOnDelete();
            $table->foreignId('required_module_id')->constrained('core_modules')->cascadeOnDelete();
            $table->unique(['module_id', 'required_module_id']);
        });

        Schema::create('workspace_modules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('core_modules')->restrictOnDelete();
            $table->string('status', 20)->default('disabled');
            $table->timestamp('enabled_at')->nullable();
            $table->foreignId('enabled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disabled_at')->nullable();
            $table->foreignId('disabled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['workspace_id', 'module_id']);
        });

        Schema::create('organization_module_policies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('core_modules')->restrictOnDelete();
            $table->string('policy', 20)->default('allowed');
            $table->timestamps();
            $table->unique(['organization_id', 'module_id']);
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_modules ADD CONSTRAINT core_modules_availability_check CHECK (availability IN ('available', 'unavailable'))");
            DB::statement('ALTER TABLE core_module_dependencies ADD CONSTRAINT core_module_dependencies_no_self_check CHECK (module_id <> required_module_id)');
            DB::statement("ALTER TABLE workspace_modules ADD CONSTRAINT workspace_modules_status_check CHECK (status IN ('enabled', 'disabled'))");
            DB::statement("ALTER TABLE organization_module_policies ADD CONSTRAINT organization_module_policies_policy_check CHECK (policy IN ('allowed', 'denied'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_module_policies');
        Schema::dropIfExists('workspace_modules');
        Schema::dropIfExists('core_module_dependencies');
        Schema::dropIfExists('core_modules');
    }
};
