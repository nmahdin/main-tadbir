<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Invitation persistence (Stage C6-1).
     *
     * One narrowly scoped table for Organization and Workspace
     * invitations. Scope integrity is enforced at the database
     * level on MySQL (CHECK wired in a follow-up statement because
     * SQLite cannot express it portably and the existing test
     * suites run on SQLite):
     *  - type = 'organization' => organization_id set, workspace_id null
     *  - type = 'workspace'    => workspace_id set, organization_id null
     * Only the SHA-256 hash of the single-use token is stored; the
     * raw token exists solely at the issuance boundary. Status is
     * stored as pending|accepted|revoked; expiry is evaluated
     * deterministically from expires_at (no cron rewrite), so an
     * elapsed pending row is *effectively* expired without a
     * scheduled state change. Duplicate *effective* pending
     * invitations (same scope, email, intended role) are rejected
     * by the issuing service under the scope-container lock — a
     * generated-column uniqueness cannot express the expiry part,
     * so the rule lives in the service on both engines and is
     * proven under InnoDB concurrency.
     */
    public function up(): void
    {
        Schema::create('core_invitations', function (Blueprint $table) {
            $table->id();
            $table->string('type', 20);
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->foreignId('workspace_id')->nullable()->constrained('workspaces')->restrictOnDelete();
            $table->string('email_normalized', 320);
            $table->char('token_hash', 64)->unique();
            $table->string('status', 20)->default('pending');
            $table->foreignId('intended_role_id')->constrained('core_roles')->restrictOnDelete();
            $table->foreignId('invited_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_by_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('status_version')->default(1);
            $table->timestamps();

            $table->index(['type', 'organization_id', 'status'], 'core_invitations_org_scope_idx');
            $table->index(['type', 'workspace_id', 'status'], 'core_invitations_ws_scope_idx');
            $table->index('email_normalized', 'core_invitations_email_idx');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE core_invitations ADD CONSTRAINT core_invitations_scope_chk CHECK (
                (type = 'organization' AND organization_id IS NOT NULL AND workspace_id IS NULL)
                OR (type = 'workspace' AND workspace_id IS NOT NULL AND organization_id IS NULL)
            )");
            DB::statement("ALTER TABLE core_invitations ADD CONSTRAINT core_invitations_status_chk CHECK (status IN ('pending', 'accepted', 'revoked'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_invitations');
    }
};
