<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * C5-M5 — Financial documents: invoices and payment receipts.
     *
     * Adds two additive tables:
     *
     *   - core_billing_documents: uniquely numbered immutable financial
     *     documents (invoices, receipts). Each document snapshots the
     *     seller/buyer/order/plan/period/itemized amounts in BIGINT
     *     Toman (never floats), and links back to its originating
     *     order/payment. Invoices are issued on order paid (M3) and
     *     receipts are issued on successful settlement. Zero-payable
     *     orders receive a truthful zero-amount invoice/receipt
     *     pair with no provider transaction reference.
     *
     *   - core_billing_document_events: append-only issuance/void
     *     audit log (status: draft|issued|void; immutable once issued
     *     except explicit void which is itself a recorded event).
     *
     * Document numbering uses a database sequence via
     * core_billing_document_sequences keyed by (owner_key, type,
     * period_year, period_month) to produce gap-free monotonic
     * numbers scoped to the issuing entity.
     *
     * CHECK constraints are MySQL/MariaDB-only, consistent with the
     * ratchet established in M1..M4.
     */
    public function up(): void
    {
        Schema::create('core_billing_document_sequences', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('owner_key', 64);
            $table->string('doc_type', 16); // invoice|receipt
            $table->unsignedSmallInteger('period_year');
            $table->unsignedTinyInteger('period_month');
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
            $table->unique(['owner_key', 'doc_type', 'period_year', 'period_month'], 'billing_doc_seq_unique');
        });

        Schema::create('core_billing_documents', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('owner_key', 64);
            $table->unsignedBigInteger('number');
            $table->string('doc_number', 64)->unique(); // e.g. INV-1403-08-0001
            $table->string('doc_type', 16); // invoice|receipt
            $table->string('status', 16)->default('draft'); // draft|issued|void
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('payment_id')->nullable();
            $table->unsignedBigInteger('related_invoice_id')->nullable(); // receipt -> invoice link
            $table->string('period', 16)->nullable(); // monthly|quarterly|annual|null (zero-payable/other)
            // Snapshot fields (immutable once issued)
            $table->string('seller_name', 255)->nullable();
            $table->string('seller_tax_id', 64)->nullable();
            $table->string('buyer_name', 255)->nullable();
            $table->string('buyer_contact', 255)->nullable();
            $table->unsignedBigInteger('plan_version_id')->nullable();
            $table->string('plan_name_snapshot', 255)->nullable();
            $table->string('currency_code', 16)->default('TOMAN');
            $table->bigInteger('subtotal_toman');
            $table->bigInteger('discount_toman')->default(0);
            $table->bigInteger('tax_toman')->default(0);
            $table->bigInteger('total_toman');
            $table->string('tax_rate_snapshot', 32)->nullable();
            $table->string('promo_code_snapshot', 64)->nullable();
            $table->string('provider_name', 32)->nullable();
            $table->string('provider_transaction_id', 128)->nullable();
            $table->json('items_json'); // itemized lines
            $table->text('notes')->nullable();
            $table->string('idempotency_key', 128);
            $table->timestamp('issued_at')->useCurrent();
            $table->timestamp('voided_at')->nullable();
            $table->unsignedBigInteger('voided_by_user_id')->nullable();
            $table->string('void_reason', 500)->nullable();
            $table->unsignedBigInteger('created_by_user_id')->nullable();
            $table->timestamps();

            $table->foreign('order_id', 'billing_doc_order_foreign')
                ->references('id')->on('core_billing_orders')->restrictOnDelete();
            $table->foreign('payment_id', 'billing_doc_payment_foreign')
                ->references('id')->on('core_billing_payments')->restrictOnDelete();
            $table->foreign('related_invoice_id', 'billing_doc_rel_invoice_foreign')
                ->references('id')->on('core_billing_documents')->restrictOnDelete();
            $table->foreign('plan_version_id', 'billing_doc_version_foreign')
                ->references('id')->on('core_plan_versions')->restrictOnDelete();
            $table->unique(['owner_key', 'doc_type', 'number'], 'billing_doc_owner_number_unique');
            $table->unique(['order_id', 'doc_type', 'payment_id'], 'billing_doc_order_type_payment_unique');
            $table->index(['owner_key', 'issued_at'], 'billing_doc_owner_issued_idx');
        });

        Schema::create('core_billing_document_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('document_id');
            $table->string('event', 32); // created|issued|voided|viewed
            $table->string('from_status', 16)->nullable();
            $table->string('to_status', 16)->nullable();
            $table->json('data')->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->timestamp('occurred_at')->useCurrent();
            $table->foreign('document_id', 'billing_doc_ev_doc_foreign')
                ->references('id')->on('core_billing_documents')->cascadeOnDelete();
            $table->index(['document_id', 'occurred_at'], 'billing_doc_ev_doc_time_idx');
        });

        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement(
                'ALTER TABLE core_billing_documents ADD CONSTRAINT billing_doc_type_valid CHECK '.
                "(doc_type IN ('invoice','receipt'))"
            );
            DB::statement(
                'ALTER TABLE core_billing_documents ADD CONSTRAINT billing_doc_status_valid CHECK '.
                "(status IN ('draft','issued','void'))"
            );
            DB::statement(
                'ALTER TABLE core_billing_documents ADD CONSTRAINT billing_doc_amounts_nonnegative CHECK '.
                '(subtotal_toman >= 0 AND discount_toman >= 0 AND tax_toman >= 0 AND total_toman >= 0)'
            );
            DB::statement(
                'ALTER TABLE core_billing_documents ADD CONSTRAINT billing_doc_total_consistent CHECK '.
                '(total_toman = subtotal_toman - discount_toman + tax_toman)'
            );
            DB::statement(
                'ALTER TABLE core_billing_document_events ADD CONSTRAINT billing_doc_event_valid CHECK '.
                "(event IN ('created','issued','voided','viewed'))"
            );
        }
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $this->dropCheckIfExists('core_billing_document_events', 'billing_doc_event_valid');
            $this->dropCheckIfExists('core_billing_documents', 'billing_doc_total_consistent');
            $this->dropCheckIfExists('core_billing_documents', 'billing_doc_amounts_nonnegative');
            $this->dropCheckIfExists('core_billing_documents', 'billing_doc_status_valid');
            $this->dropCheckIfExists('core_billing_documents', 'billing_doc_type_valid');
        }
        Schema::dropIfExists('core_billing_document_events');
        Schema::dropIfExists('core_billing_documents');
        Schema::dropIfExists('core_billing_document_sequences');
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
