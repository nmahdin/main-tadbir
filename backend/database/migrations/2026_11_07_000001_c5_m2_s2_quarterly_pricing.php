<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C5-M2-S2 (Stage A prerequisite) — quarterly pricing support.
 *
 * Additive, MariaDB 10.4 compatible:
 *  - Adds published_quarterly_price_id canonical pointer on core_plan_versions.
 *  - Widens the period CHECK constraint on core_plan_prices to accept 'quarterly'.
 *  - Adds an index on (plan_version_id, period) for the new pointer's lookup path.
 *
 * Backwards compatible: existing monthly/annual records are untouched; the
 * nullable FK defaults to NULL (quarterly not published / not offered), so
 * deployed plans continue to serve only their existing monthly/annual prices.
 *
 * Does not rewrite any existing subscription periods or fabricate quarterly
 * prices; quarterly prices must be published explicitly through
 * PlanPricePublisher.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core_plan_versions', function (Blueprint $table): void {
            $table->unsignedBigInteger('published_quarterly_price_id')->nullable()
                ->after('published_annual_price_id');
            $table->foreign('published_quarterly_price_id')
                ->references('id')->on('core_plan_prices')
                ->nullOnDelete();
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            // MariaDB/MySQL CHECK constraints cannot be altered in place portably;
            // drop the existing period check and re-add it with 'quarterly'.
            DB::statement('ALTER TABLE core_plan_prices DROP CONSTRAINT core_plan_prices_period_check');
            DB::statement("ALTER TABLE core_plan_prices ADD CONSTRAINT core_plan_prices_period_check CHECK (period IN ('monthly','quarterly','annual'))");
        }

        Schema::table('core_plan_prices', function (Blueprint $table): void {
            // Published-pointer lookup index now extended; the existing
            // version+period+is_published index is widened by adding a new
            // covering index for period-only lookup.
            $table->index(['plan_version_id', 'period'], 'core_plan_prices_version_period_idx');
        });
    }

    public function down(): void
    {
        Schema::table('core_plan_prices', function (Blueprint $table): void {
            $table->dropIndex('core_plan_prices_version_period_idx');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE core_plan_prices DROP CONSTRAINT core_plan_prices_period_check');
            DB::statement("ALTER TABLE core_plan_prices ADD CONSTRAINT core_plan_prices_period_check CHECK (period IN ('monthly','annual'))");
        }

        Schema::table('core_plan_versions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('published_quarterly_price_id');
        });
    }
};
