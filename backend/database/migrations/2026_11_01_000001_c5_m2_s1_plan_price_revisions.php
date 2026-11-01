<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C5-M2-S1 — paid price revisions and canonical published-price
 * pointers.
 *
 * Additive schema, MariaDB 10.4 compatible. Per SPEC-C5-M2 §3.2, the
 * single-published-price invariant is enforced by the canonical
 * pointers published_monthly_price_id / published_annual_price_id on
 * core_plan_versions (transactionally updated under the plan-version
 * row lock) plus a defensive unique index on (plan_version_id, period,
 * amount_toman). A boolean `is_published` is retained as a
 * history/status flag; resolvers must trust the pointer, not the flag.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_plan_prices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('plan_version_id')->constrained('core_plan_versions')->restrictOnDelete();
            $table->string('period', 10); // 'monthly' | 'annual'
            $table->unsignedBigInteger('amount_toman');
            $table->boolean('is_published')->default(false);
            $table->dateTime('superseded_at')->nullable();
            $table->dateTime('published_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            // Defensive uniqueness; NOT relied upon for the single-
            // published-price invariant (per SPEC §3.2).
            $table->unique(['plan_version_id', 'period', 'amount_toman'], 'core_plan_prices_version_period_amount_uniq');
            $table->index(['plan_version_id', 'period', 'is_published'], 'core_plan_prices_published_lookup_idx');
        });

        Schema::table('core_plan_versions', function (Blueprint $table): void {
            $table->unsignedBigInteger('published_monthly_price_id')->nullable()->after('published_at');
            $table->unsignedBigInteger('published_annual_price_id')->nullable()->after('published_monthly_price_id');
            $table->foreign('published_monthly_price_id')
                ->references('id')->on('core_plan_prices')
                ->nullOnDelete();
            $table->foreign('published_annual_price_id')
                ->references('id')->on('core_plan_prices')
                ->nullOnDelete();
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_plan_prices ADD CONSTRAINT core_plan_prices_period_check CHECK (period IN ('monthly','annual'))");
            DB::statement('ALTER TABLE core_plan_prices ADD CONSTRAINT core_plan_prices_amount_check CHECK (amount_toman >= 0)');
        }
    }

    public function down(): void
    {
        Schema::table('core_plan_versions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('published_annual_price_id');
            $table->dropConstrainedForeignId('published_monthly_price_id');
        });
        Schema::dropIfExists('core_plan_prices');
    }
};
