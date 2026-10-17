<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Stage C5-4 — plan changes are recorded as their own immutable
 * subscription period operation. Widens the MySQL CHECK on
 * core_subscription_periods.operation to include 'plan_change'
 * (SQLite never had the CHECK, per repository convention).
 * Historical rows are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE core_subscription_periods DROP CHECK core_subscription_periods_operation_check');
            DB::statement("ALTER TABLE core_subscription_periods ADD CONSTRAINT core_subscription_periods_operation_check CHECK (operation IN ('initial', 'renewal', 'plan_change'))");
        }
    }

    public function down(): void
    {
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE core_subscription_periods DROP CHECK core_subscription_periods_operation_check');
            DB::statement("ALTER TABLE core_subscription_periods ADD CONSTRAINT core_subscription_periods_operation_check CHECK (operation IN ('initial', 'renewal'))");
        }
    }
};
