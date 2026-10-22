<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C2-4 — operational request tracking for platform bootstrap
 * and emergency recovery.
 *
 * Every signed operation token carries a unique request_id; a row
 * here is written when the request is consumed (inside the same
 * transaction as the grant, the bootstrap closure, and the audit
 * record) or, best-effort and outside that transaction, when a
 * verifiable request is rejected (diagnostics only — rejected rows
 * never carry secret material, which is never stored anywhere).
 *
 * The UNIQUE index on request_id is the transaction-safe replay
 * barrier; the platform control-row lock serializes execution on
 * top of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_operation_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('request_id', 80)->unique();
            $table->string('operation', 20);
            $table->string('operator_id', 120);
            $table->foreignId('target_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('incident_id', 120)->nullable();
            $table->string('status', 20)->default('consumed');
            $table->string('failure_code', 60)->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Non-destructive rollback: consumed operation records are
     * operational history and block rollback, exactly like
     * assignment history in C2-1.
     */
    public function down(): void
    {
        if (Schema::hasTable('platform_operation_requests')
            && DB::table('platform_operation_requests')->where('status', 'consumed')->exists()) {
            throw new RuntimeException('C2-4 rollback refused: consumed platform operation records exist.');
        }

        Schema::dropIfExists('platform_operation_requests');
    }
};
