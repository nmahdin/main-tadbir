<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C5-M2-S2 — commercial catalog, tax and promotion foundation.
 *
 * Additive, MariaDB 10.4 compatible. Introduces:
 *  - core_tax_rules: itemized tax rule with integer basis-point rate,
 *    active flag, and validity window. At most one rule may be active
 *    at any instant (enforced by a tiny serializable ticket plus the
 *    TaxRuleService guard; a partial unique index would be ideal but
 *    MariaDB 10.4 has no convenient expression-index, so the guard is
 *    in TaxRuleService::activate() under a FOR UPDATE lock).
 *  - core_promotions: promotion codes with percent/fixed discount,
 *    validity window, per-owner limit and max_redemptions; code is
 *    stored case-insensitively for lookup (we normalize at write
 *    time); redemptions reserved/counted transactionally in S3.
 *
 * No payment, order, invoice or quote tables are introduced by this
 * migration (those belong to S3/S4). The promo/tax services expose
 * evaluation-only primitives and a capacity check so S3 can perform
 * reservation inside the quote-creation transaction.
 *
 * No destructive operations; existing plan, price, subscription and
 * free-plan data is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_tax_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('label', 120);
            $table->unsignedSmallInteger('rate_basis_points'); // 0–10000 (100.00%)
            $table->boolean('is_active')->default(false);
            $table->dateTime('valid_from')->nullable();
            $table->dateTime('valid_until')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('deactivated_by')->nullable();
            $table->dateTime('deactivated_at')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'valid_from', 'valid_until'], 'core_tax_rules_active_window_idx');
        });

        Schema::create('core_promotions', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 32)->unique(); // normalized (trim + uppercase) at write
            $table->string('label', 120);
            $table->string('discount_type', 10); // 'percent' | 'fixed'
            $table->unsignedSmallInteger('discount_value_bp')->nullable(); // for percent: 0–10000
            $table->unsignedBigInteger('discount_value_toman')->nullable(); // for fixed: >= 0
            $table->boolean('is_active')->default(true);
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->unsignedInteger('max_redemptions')->nullable(); // null = unlimited
            $table->unsignedInteger('per_owner_limit')->nullable(); // null = unlimited
            $table->unsignedInteger('redeemed_count')->default(0);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('deactivated_by')->nullable();
            $table->dateTime('deactivated_at')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'starts_at', 'ends_at'], 'core_promotions_active_window_idx');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE core_tax_rules ADD CONSTRAINT core_tax_rules_rate_check CHECK (rate_basis_points BETWEEN 0 AND 10000)');
            DB::statement('ALTER TABLE core_tax_rules ADD CONSTRAINT core_tax_rules_window_check CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)');
            DB::statement("ALTER TABLE core_promotions ADD CONSTRAINT core_promotions_discount_type_check CHECK (discount_type IN ('percent','fixed'))");
            DB::statement("ALTER TABLE core_promotions ADD CONSTRAINT core_promotions_discount_value_check CHECK ((discount_type='percent' AND discount_value_bp IS NOT NULL AND discount_value_bp BETWEEN 0 AND 10000 AND discount_value_toman IS NULL) OR (discount_type='fixed' AND discount_value_toman IS NOT NULL AND discount_value_toman >= 0 AND discount_value_bp IS NULL))");
            DB::statement('ALTER TABLE core_promotions ADD CONSTRAINT core_promotions_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_promotions');
        Schema::dropIfExists('core_tax_rules');
    }
};
