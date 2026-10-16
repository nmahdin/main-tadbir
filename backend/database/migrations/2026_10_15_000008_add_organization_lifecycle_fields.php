<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C3-1 (amended) — organization lifecycle fields.
 *
 * Organizations already carry `status`; this migration adds the
 * suspension/termination metadata and optimistic-concurrency
 * version used by OrganizationLifecycleService. Existing rows keep
 * their current status and receive status_version = 1. The
 * application accepts exactly `active`, `suspended`, and `ended`;
 * MySQL enforces that set with a CHECK constraint (SQLite cannot
 * add a CHECK to an existing table without a rebuild, so the
 * enum/service remains authoritative there, consistent with
 * earlier additive migrations). `ended` is a logical business
 * termination state: no records are deleted, and no SoftDeletes
 * behavior is attached to the model.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table): void {
            $table->timestamp('suspended_at')->nullable();
            $table->foreignId('suspended_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('ended_at')->nullable();
            $table->foreignId('ended_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('status_version')->default(1);
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE organizations ADD CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspended', 'ended'))");
        }
    }

    /**
     * Refuses to discard lifecycle history. A rollback is safe
     * only when every organization is active and no suspension or
     * termination metadata has been recorded.
     */
    public function down(): void
    {
        $hasLifecycleHistory = DB::table('organizations')
            ->where('status', '!=', 'active')
            ->orWhereNotNull('suspended_at')
            ->orWhereNotNull('suspended_by_user_id')
            ->orWhereNotNull('ended_at')
            ->orWhereNotNull('ended_by_user_id')
            ->exists();

        if ($hasLifecycleHistory) {
            throw new RuntimeException('C3-1 rollback refused: organization lifecycle history exists.');
        }

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE organizations DROP CHECK organizations_status_check');
        }

        Schema::table('organizations', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('suspended_by_user_id');
            $table->dropConstrainedForeignId('ended_by_user_id');
            $table->dropColumn(['suspended_at', 'ended_at', 'status_version']);
        });
    }
};
