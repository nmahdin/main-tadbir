<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // -------- C7-A: Administrative MFA -----------------------------
        Schema::create('security_mfa_factors', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 20)->default('totp'); // totp is the MVP factor
            $table->text('secret_encrypted'); // encrypted at rest via app Crypt
            $table->string('status', 20)->default('pending'); // pending|active|disabled
            $table->string('recovery_nonce', 64)->nullable(); // single-use enrollment nonce
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->unsignedInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status'], 'mfa_user_status_idx');
        });

        Schema::create('security_mfa_recovery_codes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('code_hash', 100); // bcrypt hash of a one-time recovery code
            $table->timestamp('used_at')->nullable();
            $table->foreignId('used_by_factor_id')->nullable()->constrained('security_mfa_factors')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'used_at'], 'mfa_recovery_user_idx');
        });

        Schema::create('security_mfa_challenges', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('factor_id')->nullable()->constrained('security_mfa_factors')->nullOnDelete();
            $table->string('purpose', 60); // login, step_up, recovery, factor_change
            $table->string('challenge_token_hash', 100)->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->string('request_ip', 45)->nullable();
            $table->string('request_correlation', 64)->nullable();
            $table->string('session_id', 128)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'purpose', 'expires_at'], 'mfa_challenge_user_idx');
            $table->index(['challenge_token_hash'], 'mfa_challenge_token_idx');
        });

        // -------- C7-B: Step-up sessions -------------------------------
        Schema::create('security_step_up_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('auth_token_id', 128); // references sanctum personal_access_tokens.id? we keep it loose
            $table->string('scope', 60); // platform.admin, billing.manage, backup.restore, etc.
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('request_ip', 45)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'scope', 'expires_at'], 'stepup_user_scope_idx');
        });

        // -------- C7-C: Security events -------------------------------
        Schema::create('security_events', function (Blueprint $table): void {
            $table->id();
            $table->string('event_type', 80);
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_guard', 40)->nullable(); // user, platform, system
            $table->unsignedBigInteger('target_user_id')->nullable();
            $table->string('target_type', 60)->nullable();
            $table->unsignedBigInteger('target_id')->nullable();
            $table->string('scope_type', 40)->nullable(); // platform, organization, workspace
            $table->unsignedBigInteger('scope_id')->nullable();
            $table->string('outcome', 20); // success, failure, blocked, rate_limited
            $table->string('request_ip', 45)->nullable();
            $table->string('correlation_id', 64)->nullable();
            $table->json('metadata')->nullable(); // never contain secrets (service redacts)
            $table->timestamp('occurred_at')->nullable()->useCurrent();

            $table->index(['event_type', 'occurred_at'], 'secev_type_time_idx');
            $table->index(['actor_user_id', 'occurred_at'], 'secev_actor_time_idx');
            $table->index(['target_user_id', 'occurred_at'], 'secev_target_time_idx');
            $table->index(['correlation_id'], 'secev_corr_idx');
        });

        // -------- C7-E: Incidents and alerts --------------------------
        Schema::create('ops_incidents', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique(); // INC-YYYYMM-NNNNN
            $table->string('title', 200);
            $table->string('severity', 16); // critical, high, medium, low, info
            $table->string('status', 20); // open, acknowledged, investigating, mitigated, resolved
            $table->string('source', 60)->nullable(); // manual, health, alert
            $table->text('summary')->nullable();
            $table->text('resolution_notes')->nullable();
            $table->foreignId('opened_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at')->nullable()->useCurrent();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('mitigated_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'severity', 'opened_at'], 'ops_inc_status_idx');
            $table->index(['assigned_to_user_id', 'status'], 'ops_inc_assignee_idx');
        });

        Schema::create('ops_incident_activity', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('incident_id')->constrained('ops_incidents')->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 60);
            $table->json('payload')->nullable();
            $table->timestamp('occurred_at')->nullable()->useCurrent();

            $table->index(['incident_id', 'occurred_at'], 'ops_inc_act_time_idx');
        });

        Schema::create('ops_alerts', function (Blueprint $table): void {
            $table->id();
            $table->string('fingerprint', 120); // deterministic dedup key (source+subject)
            $table->string('source', 60); // health, queue, backup, billing, custom
            $table->string('severity', 16);
            $table->string('status', 20); // open, acknowledged, suppressed, resolved
            $table->string('title', 200);
            $table->text('body')->nullable();
            $table->json('payload')->nullable();
            $table->foreignId('incident_id')->nullable()->constrained('ops_incidents')->nullOnDelete();
            $table->unsignedInteger('occurrence_count')->default(1);
            $table->timestamp('first_observed_at')->nullable()->useCurrent();
            $table->timestamp('last_observed_at')->nullable()->useCurrent();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('acknowledged_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['fingerprint', 'status'], 'ops_alert_fp_status_uniq');
            $table->index(['status', 'severity', 'last_observed_at'], 'ops_alert_status_idx');
        });

        Schema::create('ops_alert_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('alert_id')->constrained('ops_alerts')->cascadeOnDelete();
            $table->string('channel', 60); // log, mail, bale, webhook (adapters later)
            $table->string('status', 20); // pending, sent, failed
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['alert_id', 'status'], 'ops_alert_deliv_idx');
        });

        // -------- C7-F: Maintenance windows ---------------------------
        Schema::create('ops_maintenance_windows', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 200);
            $table->string('scope', 60); // platform, billing, messaging, full
            $table->text('reason')->nullable();
            $table->string('status', 20); // scheduled, active, completed, cancelled
            $table->timestamp('scheduled_start')->nullable();
            $table->timestamp('scheduled_end')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('authorized_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cancelled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'scheduled_start'], 'ops_maint_status_idx');
        });

        // -------- C7-G/H: Backup + restore verification ---------------
        Schema::create('ops_backup_jobs', function (Blueprint $table): void {
            $table->id();
            $table->char('job_uuid', 36)->unique();
            $table->string('type', 30); // full, database, files, metadata
            $table->string('status', 30); // requested, running, succeeded, failed, verified
            $table->string('disk', 60)->nullable();
            $table->string('path', 500)->nullable(); // manifest path
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->char('checksum_sha256', 64)->nullable();
            $table->string('db_dump_path', 500)->nullable();
            $table->string('files_archive_path', 500)->nullable();
            $table->unsignedInteger('file_count')->nullable();
            $table->string('schema_version', 100)->nullable(); // recorded migration version
            $table->json('manifest')->nullable(); // artifact list, sizes, checksums
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('retention_until')->nullable();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'created_at'], 'ops_backup_status_idx');
            $table->index(['retention_until'], 'ops_backup_retention_idx');
        });

        Schema::create('ops_restore_verifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('backup_job_id')->constrained('ops_backup_jobs')->restrictOnDelete();
            $table->string('status', 30); // requested, preflight_passed, restoring, restored, verified, failed
            $table->string('target_database', 100)->nullable(); // disposable test db name
            $table->string('target_storage_prefix', 500)->nullable(); // isolated test storage prefix
            $table->json('preflight')->nullable(); // manifest validation results
            $table->json('findings')->nullable(); // integrity check results, health status
            $table->text('error_message')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['backup_job_id', 'status'], 'ops_restore_bk_idx');
        });

        // -------- CHECK constraints (MySQL/MariaDB only) --------------
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE security_mfa_factors ADD CONSTRAINT mfa_factors_type_check CHECK (type IN ('totp'))");
            DB::statement("ALTER TABLE security_mfa_factors ADD CONSTRAINT mfa_factors_status_check CHECK (status IN ('pending','active','disabled'))");
            DB::statement("ALTER TABLE security_events ADD CONSTRAINT secev_outcome_check CHECK (outcome IN ('success','failure','blocked','rate_limited'))");
            DB::statement("ALTER TABLE ops_incidents ADD CONSTRAINT ops_inc_severity_check CHECK (severity IN ('critical','high','medium','low','info'))");
            DB::statement("ALTER TABLE ops_incidents ADD CONSTRAINT ops_inc_status_check CHECK (status IN ('open','acknowledged','investigating','mitigated','resolved'))");
            DB::statement("ALTER TABLE ops_alerts ADD CONSTRAINT ops_alert_severity_check CHECK (severity IN ('critical','high','medium','low','info'))");
            DB::statement("ALTER TABLE ops_alerts ADD CONSTRAINT ops_alert_status_check CHECK (status IN ('open','acknowledged','suppressed','resolved'))");
            DB::statement("ALTER TABLE ops_maintenance_windows ADD CONSTRAINT ops_maint_status_check CHECK (status IN ('scheduled','active','completed','cancelled'))");
            DB::statement("ALTER TABLE ops_backup_jobs ADD CONSTRAINT ops_backup_type_check CHECK (type IN ('full','database','files','metadata'))");
            DB::statement("ALTER TABLE ops_backup_jobs ADD CONSTRAINT ops_backup_status_check CHECK (status IN ('requested','running','succeeded','failed','verified'))");
            DB::statement("ALTER TABLE ops_restore_verifications ADD CONSTRAINT ops_restore_status_check CHECK (status IN ('requested','preflight_passed','restoring','restored','verified','failed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ops_restore_verifications');
        Schema::dropIfExists('ops_backup_jobs');
        Schema::dropIfExists('ops_maintenance_windows');
        Schema::dropIfExists('ops_alert_deliveries');
        Schema::dropIfExists('ops_alerts');
        Schema::dropIfExists('ops_incident_activity');
        Schema::dropIfExists('ops_incidents');
        Schema::dropIfExists('security_events');
        Schema::dropIfExists('security_step_up_sessions');
        Schema::dropIfExists('security_mfa_challenges');
        Schema::dropIfExists('security_mfa_recovery_codes');
        Schema::dropIfExists('security_mfa_factors');
    }
};
