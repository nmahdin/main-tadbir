<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * C5-M3-A — payment attempt and event log.
 *
 * Adds two additive tables:
 *
 *   - core_billing_payments: provider-neutral payment attempt
 *     linked one-to-many from an order (multiple attempts per order
 *     are allowed until one succeeds or the order expires). Carries
 *     immutable requested amount (signed BIGINT Toman), requested
 *     currency, the provider name + opaque external ids, current
 *     status, the authoritative verification outcome (verified
 *     amount / provider transaction id / verified_at), idempotency
 *     identity, reconciliation bookkeeping, and timestamps.
 *
 *   - core_billing_payment_events: immutable append-only audit
 *     log of every state transition and provider interaction, with
 *     redacted diagnostic metadata (request/response payloads as
 *     JSON; sensitive fields redacted by the gateway adapter
 *     before persisting).
 *
 * Both tables use restrictive FKs to orders/owners/actors.
 * MariaDB 10.4 / MySQL 8 / SQLite safe. CHECK constraints are
 * MySQL/MariaDB-only (consistent with S1..S4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_billing_payments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('order_id');
            $table->string('owner_key', 40);
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('personal_workspace_id')->nullable();
            // Idempotency (composite unique with owner_key, matching orders).
            $table->string('idempotency_key', 80);
            $table->char('payload_hash', 64)->nullable();
            // Provider identity.
            $table->string('provider', 32)->default('sandbox'); // sandbox|<psp-name>
            $table->string('provider_method', 32)->default('redirect'); // redirect|zero_pay
            $table->string('provider_payment_id', 128)->nullable();
            $table->string('provider_authority', 128)->nullable();
            // Requested amount (immutable snapshot of order.total_toman).
            $table->bigInteger('requested_amount_toman');
            $table->string('requested_currency', 8)->default('TOMAN');
            // Verification outcome.
            $table->bigInteger('verified_amount_toman')->nullable();
            $table->string('verified_currency', 8)->nullable();
            $table->string('provider_transaction_id', 128)->nullable();
            $table->string('provider_trace_id', 128)->nullable();
            $table->dateTime('initiated_at')->nullable();
            $table->dateTime('verified_at')->nullable();
            $table->dateTime('last_provider_attempt_at')->nullable();
            // Status lifecycle: initiated → pending → paid | failed | cancelled | expired.
            // 'zero_settled' is the special path for total_toman=0 orders (no PSP call).
            $table->string('status', 24)->default('initiated');
            $table->string('failure_code', 64)->nullable();
            $table->string('failure_reason', 500)->nullable();
            // Reconciliation/retry metadata.
            $table->unsignedInteger('verification_attempts')->default(0);
            $table->dateTime('next_reconcile_after')->nullable();
            $table->string('reconciliation_state', 24)->nullable(); // pending|resolved|abandoned
            $table->dateTime('finalized_at')->nullable();
            // Fulfillment outbox key (transactional-outbox correlation; see M3-C).
            $table->string('fulfillment_event_id', 80)->nullable();
            $table->dateTime('fulfilled_at')->nullable();
            // Callbacks: return_url is validated against allow-list before redirect.
            $table->string('return_url', 500)->nullable();
            // Audit.
            $table->unsignedBigInteger('created_by_user_id')->nullable();
            $table->timestamps();

            $table->foreign('order_id', 'billing_payments_order_foreign')
                ->references('id')->on('core_billing_orders')->restrictOnDelete();
            $table->foreign('organization_id', 'billing_payments_org_foreign')
                ->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign('personal_workspace_id', 'billing_payments_ws_foreign')
                ->references('id')->on('workspaces')->restrictOnDelete();
            $table->foreign('created_by_user_id', 'billing_payments_actor_foreign')
                ->references('id')->on('users')->nullOnDelete();

            $table->unique(['owner_key', 'idempotency_key'], 'billing_payments_owner_idem_uniq');
            $table->index(['order_id', 'status'], 'billing_payments_order_status_idx');
            $table->index(['status', 'next_reconcile_after'], 'billing_payments_reconcile_idx');
            $table->index(['provider_payment_id'], 'billing_payments_provider_id_idx');
            $table->unique(['fulfillment_event_id'], 'billing_payments_fulfillment_uniq');
        });

        Schema::create('core_billing_payment_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('payment_id');
            $table->string('event', 40); // initiated|redirect_issued|callback_received|verification_attempted|verified_paid|verified_failed|status_changed|finalized|fulfilled|reconcile_ticked
            $table->string('from_status', 24)->nullable();
            $table->string('to_status', 24)->nullable();
            $table->json('data')->nullable(); // redacted payloads only
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->string('actor_type', 16)->default('user'); // user|system|provider
            $table->dateTime('occurred_at');
            $table->timestamps();

            $table->foreign('payment_id', 'billing_payment_events_payment_foreign')
                ->references('id')->on('core_billing_payments')->cascadeOnDelete();
            $table->foreign('actor_user_id', 'billing_payment_events_actor_foreign')
                ->references('id')->on('users')->nullOnDelete();

            $table->index(['payment_id', 'occurred_at'], 'billing_payment_events_payment_time_idx');
        });

        // Widen order-status CHECK to include M3 paid state. Keep existing
        // statuses; 'payable_pending' is the post-initiation waiting state
        // (equivalent to 'initiated' on the payment row), 'paid' is the
        // terminal successful state.
        $this->widenOrderStatusCheck();
    }

    public function down(): void
    {
        Schema::dropIfExists('core_billing_payment_events');
        Schema::dropIfExists('core_billing_payments');
        $this->restoreOrderStatusCheck();
    }

    private function widenOrderStatusCheck(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }
        $this->dropCheckIfExists('core_billing_orders', 'billing_orders_status_valid');
        DB::statement(
            'ALTER TABLE core_billing_orders ADD CONSTRAINT billing_orders_status_valid CHECK '.
            "(status IN ('in_review','cancelled','review_expired','payable_pending','paid'))"
        );
    }

    private function restoreOrderStatusCheck(): void
    {
        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }
        $this->dropCheckIfExists('core_billing_orders', 'billing_orders_status_valid');
        DB::statement(
            'ALTER TABLE core_billing_orders ADD CONSTRAINT billing_orders_status_valid CHECK '.
            "(status IN ('in_review','cancelled','review_expired'))"
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
