<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C5-1 — versioned plan catalog, plan module entitlements,
 * and plan resource limits.
 *
 * Plans and their published versions are commercial-history
 * records: deletion is RESTRICTED wherever a version, entitlement,
 * or limit depends on the row, so history cannot be silently
 * destroyed. Published-version immutability is enforced at the
 * application/domain layer (see CorePlanVersion); these CHECKs
 * only pin the value domains on MySQL, following the repository's
 * SQLite-testing convention.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_plans', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 80)->unique();
            $table->string('name', 150);
            $table->string('audience', 20)->default('organization');
            $table->string('status', 20)->default('draft');
            $table->timestamps();
        });

        Schema::create('core_plan_versions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('plan_id')->constrained('core_plans')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('grace_days')->default(0);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->unique(['plan_id', 'version']);
        });

        Schema::create('core_plan_module_entitlements', function (Blueprint $table): void {
            $table->foreignId('plan_version_id')->constrained('core_plan_versions')->restrictOnDelete();
            $table->foreignId('module_id')->constrained('core_modules')->restrictOnDelete();
            $table->boolean('is_allowed')->default(false);
            $table->primary(['plan_version_id', 'module_id']);
        });

        Schema::create('core_plan_limits', function (Blueprint $table): void {
            $table->foreignId('plan_version_id')->constrained('core_plan_versions')->restrictOnDelete();
            $table->string('resource_key', 80);
            $table->unsignedBigInteger('limit_value');
            $table->boolean('is_unlimited')->default(false);
            $table->primary(['plan_version_id', 'resource_key']);
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_plans ADD CONSTRAINT core_plans_audience_check CHECK (audience IN ('personal', 'organization'))");
            DB::statement("ALTER TABLE core_plans ADD CONSTRAINT core_plans_status_check CHECK (status IN ('draft', 'active', 'retired'))");
            DB::statement('ALTER TABLE core_plan_versions ADD CONSTRAINT core_plan_versions_version_check CHECK (version > 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_plan_limits');
        Schema::dropIfExists('core_plan_module_entitlements');
        Schema::dropIfExists('core_plan_versions');
        Schema::dropIfExists('core_plans');
    }
};
