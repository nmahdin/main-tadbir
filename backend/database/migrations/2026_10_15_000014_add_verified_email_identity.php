<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Verified email identity (Stage C6-2).
     *
     * The identity system is username-based (and stays so); this
     * migration adds the smallest verified-email capability on top
     * of it:
     *  - `users.email`: the NORMALIZED address an account claims
     *    (unique — an address has exactly one owning account);
     *  - `users.email_verified_at`: set only by the email
     *    verification service after a successful challenge; any
     *    address change clears it (prior verification never carries
     *    over to a new address);
     *  - `core_email_verification_challenges`: single-use,
     *    expiring verification challenges. Only the SHA-256 hash of
     *    the 256-bit challenge token is stored; consumption is
     *    atomic (consumed_at is written in the same transaction
     *    that verifies the address).
     *
     * Nothing here auto-verifies an address: a submitted address,
     * an invitation link, or a profile edit proves nothing — only
     * EmailVerificationService::confirmEmail() may set the
     * timestamp, and only against an unconsumed, unexpired
     * challenge bound to that user and that exact address.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email', 320)->nullable()->unique();
            $table->timestamp('email_verified_at')->nullable();
        });

        Schema::create('core_email_verification_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('email_normalized', 320);
            $table->char('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'consumed_at'], 'core_email_challenges_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core_email_verification_challenges');

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email']);
            $table->dropColumn(['email', 'email_verified_at']);
        });
    }
};
