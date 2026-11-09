<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * C5-M3 addendum — promo reservations need a `redeemed_at` column to
 * record the exact instant a reserved promo capacity was finally
 * redeemed by a successful payment (parallel to the existing
 * `released_at` used for quote cancellation/expiry).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
            $table->dateTime('redeemed_at')->nullable()->after('released_at');
            $table->index(['state', 'redeemed_at'], 'billing_reservations_state_redeemed_idx');
        });
    }

    public function down(): void
    {
        Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
            $table->dropIndex('billing_reservations_state_redeemed_idx');
            $table->dropColumn('redeemed_at');
        });
    }
};
