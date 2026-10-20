<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * C5-EXT-01 M1 — recoverable pending state for Free-plan activation.
 *
 * When a legitimate personal activation or a newly created
 * organization cannot be attached to its Free subscription (plan not
 * published yet, transient conflict), the intent is recorded here
 * instead of failing the registration/creation flow. The
 * `subscriptions:resume-pending-free` command completes these rows
 * idempotently once the dependency exists. Legacy organizations are
 * never mass-assigned: only rows recorded at creation/activation
 * time (plus the personal-workspace scan in the resume command) are
 * eligible. Additive only; MariaDB 10.4-safe (dateTime, no bare
 * TIMESTAMP).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('free_activation_pending', function (Blueprint $table): void {
            $table->id();
            // Same owner-key convention as core_subscriptions:
            // 'org:{id}' or 'ws:{id}'.
            $table->string('owner_key', 40)->unique();
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->foreignId('personal_workspace_id')->nullable()->constrained('workspaces')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reason_code', 60);
            $table->unsignedInteger('attempts')->default(0);
            $table->dateTime('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('free_activation_pending');
    }
};
