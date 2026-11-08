<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * C5-M2-S4 order review (SPEC-C5-M2 §3.4, §3.6).
 *
 * Additive. Creates core_billing_orders (immutable monetary snapshot
 * derived from a quote during the review-only window) and
 * core_billing_order_lines (insert-only itemized breakdown). Also
 * adds order_id to core_billing_promo_reservations so a reservation
 * can transfer its capacity claim from quote→order across conversion
 * without going through a transient free/reserve cycle that could
 * let a concurrent buyer steal the slot.
 *
 * Order lifecyle in S4: in_review → (cancelled | review_expired).
 * Future M3 payment states (payable_pending, paid, refunded) are
 * reserved for later milestones and are NOT introduced here; the
 * API explicitly reports payment_initiated: false.
 *
 * MariaDB 10.4 safe: no partial/expression indexes, no ENUM CHECKs,
 * dateTime (never TIMESTAMP), all money columns BIGINT signed,
 * FKs RESTRICT on financial/owner references to prevent ambiguous
 * orphan records. Additive CHECKs gated to MySQL/MariaDB only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_billing_orders', function (Blueprint $table): void {
            $table->bigIncrements('id');
            // Source quote — UNIQUE so at most one order per quote.
            $table->unsignedBigInteger('quote_id')->unique();
            // Owner pair (mirrors core_billing_quotes / core_subscriptions).
            $table->string('owner_key', 80);
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('personal_workspace_id')->nullable();
            $table->string('period', 10);
            // Immutable monetary snapshot copied from the quote.
            $table->bigInteger('subtotal_toman');
            $table->bigInteger('discount_toman');
            $table->bigInteger('tax_toman');
            $table->bigInteger('total_toman');
            // Promo/tax snapshot retained for audit.
            $table->unsignedBigInteger('promo_id')->nullable();
            $table->string('promo_code_snapshot', 32)->nullable();
            $table->unsignedBigInteger('tax_rule_id')->nullable();
            $table->unsignedInteger('tax_rate_basis_points')->nullable();
            // Lifecycle.
            $table->string('status', 20)->default('in_review'); // in_review|cancelled|review_expired
            $table->dateTime('review_expires_at');
            $table->dateTime('cancelled_at')->nullable();
            $table->dateTime('expired_at')->nullable();
            // Idempotency (composite unique with owner_key).
            $table->string('idempotency_key', 80);
            $table->char('payload_hash', 64)->nullable();
            // Audit.
            $table->unsignedBigInteger('created_by_user_id')->nullable();
            $table->unsignedBigInteger('cancelled_by_user_id')->nullable();
            $table->timestamps();

            $table->foreign('quote_id')->references('id')->on('core_billing_quotes')->restrictOnDelete();
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign('personal_workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->foreign('promo_id')->references('id')->on('core_promotions')->restrictOnDelete();
            $table->foreign('tax_rule_id')->references('id')->on('core_tax_rules')->restrictOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('cancelled_by_user_id')->references('id')->on('users')->nullOnDelete();

            $table->unique(['owner_key', 'idempotency_key'], 'billing_orders_owner_idem_uniq');
            $table->index(['owner_key', 'status'], 'billing_orders_owner_status_idx');
            $table->index(['status', 'review_expires_at'], 'billing_orders_status_expires_idx');
            $table->index(['organization_id'], 'billing_orders_org_idx');
            $table->index(['personal_workspace_id'], 'billing_orders_ws_idx');
        });

        Schema::create('core_billing_order_lines', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('order_id');
            $table->string('kind', 16); // plan|discount|tax
            $table->string('description', 300);
            // Signed BIGINT Toman. Discount lines are negative.
            $table->bigInteger('amount_toman');
            $table->unsignedBigInteger('price_id')->nullable();
            $table->unsignedInteger('tax_rate_basis_points')->nullable();
            $table->dateTime('created_at');

            $table->foreign('order_id')->references('id')->on('core_billing_orders')->restrictOnDelete();
            $table->foreign('price_id')->references('id')->on('core_plan_prices')->restrictOnDelete();

            $table->index(['order_id'], 'billing_order_lines_order_idx');
        });

        // Reservation linkage: when a quote converts, its promo
        // reservation transfers to the order (same capacity slot, no
        // free/reserve flip-flop). FK uses nullOnDelete so a hard
        // purge of historical orders is possible in a later
        // operations milestone without blocking on reservation rows.
        //
        // SQLite does not support adding foreign keys via ALTER TABLE
        // in Laravel's portable schema grammar; FKs are skipped there
        // (consistent with the S3 owner-FK migration). On MySQL/MariaDB
        // the FK is added explicitly to enforce referential integrity.
        Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
            $table->unsignedBigInteger('order_id')->nullable()->after('quote_id');
            $table->index(['order_id'], 'billing_reservations_order_idx');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
                $table->foreign('order_id', 'billing_reservations_order_id_foreign')
                    ->references('id')->on('core_billing_orders')
                    ->nullOnDelete();
            });
        }

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_billing_orders ADD CONSTRAINT billing_orders_status_valid CHECK (status IN ('in_review','cancelled','review_expired'))");
            DB::statement("ALTER TABLE core_billing_orders ADD CONSTRAINT billing_orders_amounts_nonneg CHECK (subtotal_toman >= 0 AND discount_toman >= 0 AND tax_toman >= 0 AND total_toman >= 0 AND discount_toman <= subtotal_toman AND total_toman >= (subtotal_toman - discount_toman))");
            DB::statement("ALTER TABLE core_billing_orders ADD CONSTRAINT billing_orders_period_valid CHECK (period IN ('monthly','quarterly','annual'))");
            DB::statement("ALTER TABLE core_billing_order_lines ADD CONSTRAINT billing_order_lines_kind_valid CHECK (kind IN ('plan','discount','tax'))");
        }
    }

    public function down(): void
    {
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
                $table->dropForeign('billing_reservations_order_id_foreign');
            });
        }
        Schema::table('core_billing_promo_reservations', function (Blueprint $table): void {
            $table->dropIndex('billing_reservations_order_idx');
            $table->dropColumn('order_id');
        });
        Schema::dropIfExists('core_billing_order_lines');
        Schema::dropIfExists('core_billing_orders');
    }
};
