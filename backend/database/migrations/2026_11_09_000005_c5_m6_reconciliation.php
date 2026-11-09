<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * C5-M6 — Reconciliation and financial audit.
     *
     * Adds one additive table:
     *
     *   - core_billing_reconciliation_findings: restartable idempotent
     *     reconciliation detector outputs. Each finding carries a
     *     unique (finding_type, subject_type, subject_id) identity, a
     *     severity (info/warning/error/critical), status
     *     (open/resolved/ignored), machine-friendly evidence JSON,
     *     human message, safe_retry flag and resolution metadata.
     *
     * The reconciliation command (ReconcileFinancialDocuments)
     * inserts new findings on each pass and upserts existing ones,
     * while marking findings whose preconditions no longer hold as
     * resolved — never deleting audit rows.
     *
     * CHECK constraints are MySQL/MariaDB-only (consistent with the
     * C5 ratchet).
     */
    public function up(): void
    {
        Schema::create('core_billing_reconciliation_findings', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('finding_type', 64); // e.g. settled_without_fulfillment, missing_invoice, etc.
            $table->string('subject_type', 32); // payment|order|subscription|promo|document
            $table->unsignedBigInteger('subject_id');
            $table->string('severity', 16)->default('warning'); // info|warning|error|critical
            $table->string('status', 16)->default('open'); // open|resolved|ignored
            $table->boolean('safe_to_retry')->default(false);
            $table->text('message');
            $table->json('evidence')->nullable();
            $table->string('owner_key', 64)->nullable();
            $table->unsignedBigInteger('related_payment_id')->nullable();
            $table->unsignedBigInteger('related_order_id')->nullable();
            $table->unsignedBigInteger('detected_run_id')->nullable();
            $table->timestamp('detected_at')->useCurrent();
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedBigInteger('resolved_by_user_id')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();

            $table->unique(['finding_type', 'subject_type', 'subject_id'], 'billing_recon_unique');
            $table->index(['owner_key', 'status', 'severity'], 'billing_recon_owner_status_idx');
            $table->index(['subject_type', 'subject_id'], 'billing_recon_subject_idx');
        });

        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement(
                'ALTER TABLE core_billing_reconciliation_findings ADD CONSTRAINT billing_recon_severity_valid CHECK '.
                "(severity IN ('info','warning','error','critical'))"
            );
            DB::statement(
                'ALTER TABLE core_billing_reconciliation_findings ADD CONSTRAINT billing_recon_status_valid CHECK '.
                "(status IN ('open','resolved','ignored'))"
            );
        }
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $this->dropCheckIfExists('core_billing_reconciliation_findings', 'billing_recon_status_valid');
            $this->dropCheckIfExists('core_billing_reconciliation_findings', 'billing_recon_severity_valid');
        }
        Schema::dropIfExists('core_billing_reconciliation_findings');
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
