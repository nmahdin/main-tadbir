<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C1 — minimal Core audit foundation (D-18).
 *
 * audit_logs is the immutable security/domain audit stream, distinct
 * from the user-facing activity_logs feed. Append-only at the model
 * layer (no update/delete paths); writers record inside the
 * mutation's transaction. Full management-plane coverage is C10;
 * C1 wires the identity lifecycle only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->string('scope_type', 40)->nullable();
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->string('target_type', 80)->nullable();
            $table->unsignedBigInteger('target_id')->nullable();
            $table->json('summary')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['actor_user_id', 'created_at']);
            $table->index(['action', 'created_at']);
            $table->index(['scope_type', 'scope_id', 'created_at']);
            $table->index(['target_type', 'target_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
