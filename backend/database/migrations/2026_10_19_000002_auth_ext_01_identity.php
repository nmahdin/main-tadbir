<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * AUTH-EXT-01 (ADR-0021): additive identity schema.
 * - users: username_normalized (normalization-equivalent uniqueness,
 *   AMB-01=B), verification/provisioning/lifecycle markers (DATETIME,
 *   never bare TIMESTAMP — MariaDB 10.4 legacy rule of this codebase).
 * - auth_otp_challenges: hashed SMS OTP challenges (AMB-03).
 * - user_external_identities: Google OIDC subjects (no silent merges).
 * - user_terms_acceptances: versioned terms evidence.
 * - verified_phone_claims: atomic verified-phone ownership claim
 *   (AMB-06; the durable uniqueness mechanism for verified numbers).
 * - user_devices: hashed opaque device-recognition cookies (AMB-04).
 * - personal_access_tokens.device_label for the sessions screen.
 * Existing usernames are backfilled (LOWER/TRIM); a duplicate under the
 * new normalization is reported by `auth:username-preflight` and must be
 * resolved by an operator — nobody is renamed automatically.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username_normalized', 60)->nullable()->after('username');
            $table->dateTime('phone_verified_at')->nullable();
            $table->dateTime('personal_workspace_provisioned_at')->nullable();
            $table->dateTime('welcomed_at')->nullable();
            $table->dateTime('reauthenticated_at')->nullable();
            $table->dateTime('deletion_requested_at')->nullable();
        });
        DB::statement('UPDATE users SET username_normalized = LOWER(TRIM(username)) WHERE username IS NOT NULL');
        Schema::table('users', function (Blueprint $table) {
            $table->unique('username_normalized', 'users_username_normalized_unique');
        });

        Schema::create('auth_otp_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('phone', 16);
            $table->string('purpose', 24);
            $table->string('code_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->dateTime('expires_at');
            $table->dateTime('consumed_at')->nullable();
            $table->string('request_ip', 45)->nullable();
            $table->dateTime('created_at')->useCurrent();
            $table->index(['phone', 'purpose', 'created_at'], 'otp_phone_purpose_idx');
            $table->index('expires_at', 'otp_expires_idx');
        });

        Schema::create('user_external_identities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('provider', 16);
            $table->string('subject', 191);
            $table->string('email_at_link', 320)->nullable();
            $table->dateTime('last_login_at')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'subject'], 'external_identity_unique');
            $table->index('user_id', 'external_identity_user_idx');
        });

        Schema::create('user_terms_acceptances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('document_key', 40);
            $table->string('document_version', 20);
            $table->dateTime('accepted_at');
            $table->string('ip', 45)->nullable();
            $table->index(['user_id', 'document_key'], 'terms_user_doc_idx');
        });

        Schema::create('verified_phone_claims', function (Blueprint $table) {
            $table->string('phone', 16)->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->dateTime('claimed_at')->useCurrent();
        });

        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->char('device_hash', 64);
            $table->dateTime('last_seen_at');
            $table->timestamps();
            $table->unique(['user_id', 'device_hash'], 'user_device_unique');
        });

        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->string('device_label', 120)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn('device_label');
        });
        Schema::dropIfExists('user_devices');
        Schema::dropIfExists('verified_phone_claims');
        Schema::dropIfExists('user_terms_acceptances');
        Schema::dropIfExists('user_external_identities');
        Schema::dropIfExists('auth_otp_challenges');
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_username_normalized_unique');
            $table->dropColumn([
                'username_normalized', 'phone_verified_at', 'personal_workspace_provisioned_at',
                'welcomed_at', 'reauthenticated_at', 'deletion_requested_at',
            ]);
        });
    }
};
