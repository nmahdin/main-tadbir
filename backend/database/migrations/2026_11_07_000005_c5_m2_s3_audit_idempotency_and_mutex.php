<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * C5-M2-S3 acceptance audit fixes (round 2).
 *
 * 1. Replace global idempotency_key unique with composite
 *    (owner_key, idempotency_key) unique so two different owners
 *    cannot collide on a client-supplied key, and add a
 *    payload_hash column so QuoteService can reject replays with
 *    a changed payload (no silent unrelated-quote return).
 * 2. Switch created_by_user_id FK from nullOnDelete to
 *    restrictOnDelete to match the owner FKs flipped in
 *    000004; immutable financial snapshots must not lose their
 *    audit actor via cascade.
 * 3. Replace the in-table sentinel tax-rule (id=-1) introduced in
 *    000004 with a dedicated mutex table. A sentinel inserted
 *    into core_tax_rules pollutes active queries and foreign-key
 *    space; a dedicated one-row table is cleaner and uses a named
 *    unique constraint for deterministic failure if a bug tries to
 *    add a second sentinel.
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();

        // ---- 3. dedicated mutex table (build BEFORE removing in-table sentinel) ----
        Schema::create('core_tax_rule_active_mutex', function (Blueprint $table): void {
            $table->tinyIncrements('id');
            $table->string('mutex_key', 32);
            $table->timestamps();
            $table->unique(['mutex_key'], 'core_tax_rule_active_mutex_key_uniq');
        });
        DB::table('core_tax_rule_active_mutex')->insert([
            'mutex_key' => 'singleton',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Remove the in-table sentinel row from 000004; it is replaced by
        // the dedicated table above.
        DB::table('core_tax_rules')->where('id', -1)->delete();

        // ---- 1. idempotency composite + payload_hash ----
        Schema::table('core_billing_quotes', function (Blueprint $table): void {
            // Drop the global unique (Laravel-generated name).
            $table->dropUnique('core_billing_quotes_idempotency_key_unique');
            $table->unique(['owner_key', 'idempotency_key'], 'billing_quotes_owner_idem_uniq');

            $table->char('payload_hash', 64)->nullable()->after('idempotency_key');
            $table->index(['payload_hash'], 'billing_quotes_payload_hash_idx');
        });

        // ---- 2. created_by_user_id -> restrictOnDelete ----
        // Information-schema lookup only needed on MySQL/MariaDB; SQLite
        // FKs can be rebound by drop+add directly.
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $dbName = DB::connection()->getDatabaseName();
            $fks = DB::select(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'core_billing_quotes'
                 AND COLUMN_NAME = 'created_by_user_id'
                 AND REFERENCED_TABLE_NAME IS NOT NULL",
                [$dbName]
            );
            foreach ($fks as $fk) {
                DB::statement("ALTER TABLE core_billing_quotes DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
            }
        } else {
            Schema::table('core_billing_quotes', function (Blueprint $table): void {
                // SQLite does not expose FK names through information_schema,
                // but Laravel's conventional FK name for created_by_user_id
                // references users.
                $table->dropForeign(['created_by_user_id']);
            });
        }

        Schema::table('core_billing_quotes', function (Blueprint $table): void {
            $table->foreign('created_by_user_id')
                ->references('id')->on('users')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();

        Schema::table('core_billing_quotes', function (Blueprint $table): void {
            $table->dropForeign(['created_by_user_id']);
            $table->foreign('created_by_user_id')
                ->references('id')->on('users')->nullOnDelete();

            $table->dropIndex('billing_quotes_payload_hash_idx');
            $table->dropColumn('payload_hash');
            $table->dropUnique('billing_quotes_owner_idem_uniq');
            $table->unique(['idempotency_key'], 'core_billing_quotes_idempotency_key_unique');
        });

        Schema::dropIfExists('core_tax_rule_active_mutex');

        // Re-seed the in-table sentinel so 000004 can roll back cleanly.
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("INSERT IGNORE INTO core_tax_rules
                (id, label, rate_basis_points, is_active, created_at, updated_at)
                VALUES (-1, '__sentinel_lock__', 0, 0, NOW(), NOW())");
        } else {
            DB::statement("INSERT OR IGNORE INTO core_tax_rules
                (id, label, rate_basis_points, is_active, created_at, updated_at)
                VALUES (-1, '__sentinel_lock__', 0, 0, datetime('now'), datetime('now'))");
        }
    }
};
