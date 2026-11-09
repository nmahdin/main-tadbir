<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stage C7-3 schema (domain-owned path per ARCH-01).
     *
     * `core_setting_secrets` — secret payloads, SEPARATE from the
     * generic `core_setting_values` (which refuses secrets).
     * Ciphertext only (Laravel authenticated app encryption); the
     * application key itself is never stored in the database.
     * `key_version` records which environment key generation
     * encrypted the row, so a future rotation can re-encrypt
     * deliberately.
     *
     * `core_setting_revisions` — immutable, append-only history of
     * NON-SECRET mutations (and override-policy changes). Secret
     * material never appears here. Absent-vs-explicit-null is
     * preserved via the `*_present` flags alongside nullable JSON.
     */
    public function up(): void
    {
        Schema::create('core_setting_secrets', function (Blueprint $table) {
            $table->id();
            $table->string('setting_key', 120);
            $table->string('owner_type', 20);
            $table->unsignedBigInteger('owner_id');
            $table->text('ciphertext');
            $table->string('key_version', 40)->default('v1');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['owner_type', 'owner_id', 'setting_key'], 'core_setting_secrets_owner_key_unique');
            $table->index('setting_key');
            $table->foreign('setting_key')->references('key')->on('core_setting_definitions')->restrictOnDelete();
        });

        Schema::create('core_setting_revisions', function (Blueprint $table) {
            $table->id();
            $table->string('setting_key', 120);
            $table->string('owner_type', 20);
            $table->unsignedBigInteger('owner_id');
            $table->string('operation', 20);
            $table->unsignedInteger('version');
            $table->boolean('previous_present')->default(false);
            $table->text('previous_value_json')->nullable();
            $table->boolean('new_present')->default(false);
            $table->text('new_value_json')->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('audit_log_id')->nullable()->constrained('audit_logs')->nullOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->index(['owner_type', 'owner_id', 'setting_key', 'id'], 'core_setting_revisions_owner_key_idx');
            $table->foreign('setting_key')->references('key')->on('core_setting_definitions')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_setting_revisions');
        Schema::dropIfExists('core_setting_secrets');
    }
};
