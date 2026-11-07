<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * C5-M2-S3 quote engine and promotion reservation lifecycle.
     *
     * Additive. Creates core_billing_quotes (immutable monetary
     * snapshots) and core_billing_promo_reservations (atomic
     * capacity accounting for M2-D4=A). Converted/order-review
     * transitions are reserved for S4; the quotes table already
     * carries a status enum that includes 'converted' so S4 can
     * flip it without another schema change. MariaDB 10.4
     * compatible: no partial indexes, no CHECK on ENUM,
     * dateTime (never TIMESTAMP), nullable FKs use nullOnDelete
     * / restrict appropriately.
     */
    public function up(): void
    {
        Schema::create('core_billing_quotes', function (Blueprint $table) {
            $table->bigIncrements('id');
            // Owner pair — exactly one of (organization_id, personal_workspace_id).
            $table->string('owner_key', 80);
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('personal_workspace_id')->nullable();
            // Target plan/price (immutable snapshot; FKs RESTRICT so the
            // locked price + plan version cannot be removed while a quote
            // references them).
            $table->unsignedBigInteger('plan_version_id');
            $table->unsignedBigInteger('price_id');
            $table->string('period', 10); // monthly|quarterly|annual
            // Money snapshot (integer Toman; never recomputed after create).
            $table->bigInteger('subtotal_toman');
            $table->bigInteger('discount_toman');
            $table->bigInteger('tax_toman');
            $table->bigInteger('total_toman');
            // Snapshot references (nullable since a quote may have no promo
            // and no active tax rule at creation time). tax_rate_basis_points
            // is snapshotted so totals stay immutable even if rules change.
            $table->unsignedBigInteger('promo_id')->nullable();
            $table->string('promo_code_snapshot', 32)->nullable(); // code as applied (uppercase), for audit only
            $table->unsignedBigInteger('tax_rule_id')->nullable();
            $table->unsignedInteger('tax_rate_basis_points')->nullable();
            // Lifecycle.
            $table->string('status', 20)->default('open'); // open|expired|superseded|converted
            $table->dateTime('expires_at');
            $table->dateTime('converted_at')->nullable();
            $table->unsignedBigInteger('superseded_by_quote_id')->nullable();
            // Idempotency: single quote per idempotency key (unique).
            $table->string('idempotency_key', 80)->unique();
            // Audit.
            $table->unsignedBigInteger('created_by_user_id')->nullable();
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->nullOnDelete();
            $table->foreign('personal_workspace_id')->references('id')->on('workspaces')->nullOnDelete();
            $table->foreign('plan_version_id')->references('id')->on('core_plan_versions')->restrictOnDelete();
            $table->foreign('price_id')->references('id')->on('core_plan_prices')->restrictOnDelete();
            $table->foreign('promo_id')->references('id')->on('core_promotions')->restrictOnDelete();
            $table->foreign('tax_rule_id')->references('id')->on('core_tax_rules')->restrictOnDelete();
            $table->foreign('superseded_by_quote_id')->references('id')->on('core_billing_quotes')->nullOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->nullOnDelete();

            $table->index(['owner_key', 'status'], 'billing_quotes_owner_status_idx');
            $table->index(['status', 'expires_at'], 'billing_quotes_status_expires_idx');
            $table->index(['organization_id'], 'billing_quotes_org_idx');
            $table->index(['personal_workspace_id'], 'billing_quotes_ws_idx');
        });

        Schema::create('core_billing_promo_reservations', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('quote_id');
            $table->unsignedBigInteger('promo_id');
            $table->string('owner_key', 80);
            $table->string('state', 16); // reserved|released|expired|redeemed
            $table->dateTime('released_at')->nullable();
            // Idempotency: same quote+promo always resolves to same reservation row.
            $table->string('idempotency_key', 80)->unique();
            $table->timestamps();

            $table->foreign('quote_id')->references('id')->on('core_billing_quotes')->cascadeOnDelete();
            $table->foreign('promo_id')->references('id')->on('core_promotions')->restrictOnDelete();

            $table->unique(['quote_id', 'promo_id'], 'billing_reservations_quote_promo_uniq');
            $table->index(['promo_id', 'state'], 'billing_reservations_promo_state_idx');
            $table->index(['owner_key', 'promo_id', 'state'], 'billing_reservations_owner_promo_idx');
        });

        // CHECK constraints (MySQL/MariaDB; portable via raw statement).
        // Owner XOR is enforced at the application layer (mirrors
        // CoreSubscription::booted()) — MySQL refuses CHECK on columns
        // referenced by SET NULL / CASCADE foreign keys (error 3823), so
        // we do not express it as a CHECK here.
        DB::statement('ALTER TABLE core_billing_quotes ADD CONSTRAINT billing_quotes_period_valid CHECK (
            period IN (\'monthly\', \'quarterly\', \'annual\')
        )');
        DB::statement('ALTER TABLE core_billing_quotes ADD CONSTRAINT billing_quotes_status_valid CHECK (
            status IN (\'open\', \'expired\', \'superseded\', \'converted\')
        )');
        DB::statement('ALTER TABLE core_billing_quotes ADD CONSTRAINT billing_quotes_amounts_nonneg CHECK (
            subtotal_toman >= 0 AND discount_toman >= 0 AND tax_toman >= 0 AND total_toman >= 0
            AND discount_toman <= subtotal_toman
            AND total_toman >= (subtotal_toman - discount_toman)
        )');
        DB::statement('ALTER TABLE core_billing_promo_reservations ADD CONSTRAINT billing_reservations_state_valid CHECK (
            state IN (\'reserved\', \'released\', \'expired\', \'redeemed\')
        )');
    }

    public function down(): void
    {
        Schema::dropIfExists('core_billing_promo_reservations');
        Schema::dropIfExists('core_billing_quotes');
    }
};
