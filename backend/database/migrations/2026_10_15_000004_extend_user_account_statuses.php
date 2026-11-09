<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C1 — widen the account status domain additively.
 *
 * Adds `suspended` and `deactivated` (Core v1 identity lifecycle) to
 * users.status. All existing values (`active`, `inactive`, `blocked`,
 * `pending`) and their semantics are untouched: no row is rewritten,
 * no legacy account changes state. Laravel enums carry a CHECK
 * constraint on SQLite and a native ENUM on MySQL; widening via
 * change() follows the repository precedent
 * (2026_09_29_000001_repair_sqlite_archive_status_constraints).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->enum('status', ['active', 'inactive', 'blocked', 'pending', 'suspended', 'deactivated'])
                ->default('active')->change();
        });
    }

    public function down(): void
    {
        // Do not narrow the domain: accounts already suspended or
        // deactivated would be stranded outside the legacy enum.
        // Reversal is by code revert, not by schema narrowing.
    }
};
