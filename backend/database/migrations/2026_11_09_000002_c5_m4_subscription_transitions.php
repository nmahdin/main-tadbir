<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * C5-M4 — subscription transitions for paid activation, renewal,
 * upgrade and downgrade, plus pending future-effective changes and
 * the transactional outbox for payment→fulfillment handoff.
 *
 * Additive:
 *  - core_subscription_pending_changes: scheduled downgrade or
 *    future plan change applied at the end of the current paid
 *    term. upgrade goes through a new period immediately; it does
 *    not write a pending row. Each owner has at most one pending
 *    change (UNIQUE owner_key).
 *  - core_billing_fulfillment_outbox: durable, transactionally-
 *    written event row consumed by a dispatcher (idempotent via
 *    unique event_id). This is the crash-safe bridge between
 *    payment finalization and subscription fulfillment.
 *  - Links core_subscription_periods to the originating payment
 *    (paid_by_payment_id nullable FK) so audit can trace a period
 *    back to the payment attempt that funded it.
 *
 * MariaDB 10.4 / MySQL 8 / SQLite safe.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Outbox: payment writes the fulfillment event inside the
        // same DB transaction as finalization; a dispatcher reads
        // undispatched rows, invokes fulfillment, and marks
        // dispatched_at. At-least-once delivery; fulfillment_id
        // uniqueness on payments + unique(period.correlation_id)
        // make application idempotent.
        Schema::create('core_billing_fulfillment_outbox', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('event_id', 80);
            $table->string('event_type', 40); // subscription.payment_paid
            $table->unsignedBigInteger('payment_id');
            $table->unsignedBigInteger('order_id');
            $table->string('owner_key', 40);
            $table->json('payload');
            $table->dateTime('created_at');
            $table->dateTime('dispatched_at')->nullable();
            $table->unsignedTinyInteger('dispatch_attempts')->default(0);
            $table->dateTime('next_dispatch_after')->nullable();
            $table->string('last_error', 500)->nullable();

            $table->foreign('payment_id', 'billing_outbox_payment_foreign')
                ->references('id')->on('core_billing_payments')->restrictOnDelete();
            $table->foreign('order_id', 'billing_outbox_order_foreign')
                ->references('id')->on('core_billing_orders')->restrictOnDelete();

            $table->unique(['event_id'], 'billing_outbox_event_uniq');
            $table->index(['dispatched_at', 'next_dispatch_after'], 'billing_outbox_dispatch_idx');
        });

        // Pending future-effective plan changes (downgrades).
        Schema::create('core_subscription_pending_changes', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('owner_key', 40);
            $table->unsignedBigInteger('subscription_id');
            $table->unsignedBigInteger('order_id')->nullable(); // downgrade can be free or paid
            $table->unsignedBigInteger('payment_id')->nullable();
            $table->unsignedBigInteger('target_plan_version_id');
            $table->string('reason', 40); // downgrade_scheduled
            $table->string('correlation_id', 80);
            $table->dateTime('effective_at');
            $table->unsignedBigInteger('requested_by_user_id')->nullable();
            $table->dateTime('created_at');
            $table->dateTime('applied_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();

            $table->foreign('subscription_id', 'subs_pending_sub_foreign')
                ->references('id')->on('core_subscriptions')->restrictOnDelete();
            $table->foreign('order_id', 'subs_pending_order_foreign')
                ->references('id')->on('core_billing_orders')->nullOnDelete();
            $table->foreign('payment_id', 'subs_pending_payment_foreign')
                ->references('id')->on('core_billing_payments')->nullOnDelete();
            $table->foreign('target_plan_version_id', 'subs_pending_version_foreign')
                ->references('id')->on('core_plan_versions')->restrictOnDelete();
            $table->foreign('requested_by_user_id', 'subs_pending_actor_foreign')
                ->references('id')->on('users')->nullOnDelete();

            $table->unique(['owner_key'], 'subs_pending_owner_uniq');
            $table->unique(['correlation_id'], 'subs_pending_correlation_uniq');
            $table->index(['effective_at', 'applied_at', 'cancelled_at'], 'subs_pending_effective_idx');
        });

        // Link subscription periods back to the paying payment.
        Schema::table('core_subscription_periods', function (Blueprint $table): void {
            $table->unsignedBigInteger('paid_by_payment_id')->nullable()->after('correlation_id');
            $table->index(['paid_by_payment_id'], 'subs_periods_payment_idx');
        });
        // FK added separately (SQLite ALTER FK limitation — skip on sqlite, same S4 pattern).
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('core_subscription_periods', function (Blueprint $table): void {
                $table->foreign('paid_by_payment_id', 'subs_periods_payment_foreign')
                    ->references('id')->on('core_billing_payments')->nullOnDelete();
            });
        }

        // Widen subscription-period operation CHECK to include M4 operations.
        $this->widenOperationCheck();
    }

    public function down(): void
    {
        $this->restoreOperationCheck();
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            Schema::table('core_subscription_periods', function (Blueprint $table): void {
                $table->dropForeign('subs_periods_payment_foreign');
            });
        }
        Schema::table('core_subscription_periods', function (Blueprint $table): void {
            $table->dropIndex('subs_periods_payment_idx');
            $table->dropColumn('paid_by_payment_id');
        });
        Schema::dropIfExists('core_subscription_pending_changes');
        Schema::dropIfExists('core_billing_fulfillment_outbox');
    }

    private function widenOperationCheck(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }
        $this->dropCheckIfExists('core_subscription_periods', 'core_subscription_periods_operation_check');
        DB::statement(
            "ALTER TABLE core_subscription_periods ADD CONSTRAINT core_subscription_periods_operation_check CHECK ".
            "(operation IN ('initial','renewal','plan_change','paid_activation','paid_renewal','upgrade','downgrade','grace_expiry_free'))"
        );
    }

    private function restoreOperationCheck(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }
        $this->dropCheckIfExists('core_subscription_periods', 'core_subscription_periods_operation_check');
        DB::statement(
            "ALTER TABLE core_subscription_periods ADD CONSTRAINT core_subscription_periods_operation_check CHECK ".
            "(operation IN ('initial', 'renewal', 'plan_change'))"
        );
    }

    private function dropCheckIfExists(string $table, string $constraint): void
    {
        $exists = DB::table('information_schema.TABLE_CONSTRAINTS')
            ->where('CONSTRAINT_SCHEMA', DB::connection()->getDatabaseName())
            ->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $constraint)
            ->where('CONSTRAINT_TYPE', 'CHECK')
            ->exists();
        if (! $exists) {
            return;
        }
        $row = DB::selectOne('SELECT VERSION() AS version');
        $isMaria = str_contains(strtolower((string) ($row->version ?? '')), 'mariadb');
        $syntax = $isMaria ? 'DROP CONSTRAINT' : 'DROP CHECK';
        DB::statement("ALTER TABLE {$table} {$syntax} {$constraint}");
    }
};
