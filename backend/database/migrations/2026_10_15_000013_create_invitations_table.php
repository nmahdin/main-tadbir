<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Invitation persistence (Stage C6-1, incl. the approved C6
     * design amendment: three invitation intents).
     *
     * Intents:
     *  - organization: create Organization membership only;
     *  - workspace:    create Workspace membership only (the
     *    invitee's owning-organization membership, when any, is a
     *    C6-2 acceptance precondition — not created here);
     *  - combined:     for an organization-owned Workspace, create
     *    both memberships through one future atomic acceptance.
     *
     * Scope shape is enforced on MySQL by CHECK (SQLite suites rely
     * on the model guard):
     *  - organization: organization_id set, workspace_id null,
     *    intended_organization_role_id set, workspace role null;
     *  - workspace: workspace_id set, organization_id null,
     *    intended_workspace_role_id set, organization role null;
     *  - combined: both targets set (the organization MUST be the
     *    workspace's persisted owner — validated in the service,
     *    never trusted from client input) and both role intents set.
     *
     * Role intent lives in two scope-tied columns on this table
     * (existing conventions store one role per membership; no
     * separate role-intent table is warranted). Only the SHA-256
     * hash of the single-use token is stored. Expiry is evaluated
     * from expires_at (7-day default), never rewritten by a job.
     * Duplicate *effective* pending invitations (same intent,
     * scope, email, role intent) are rejected by the service under
     * the scope-container lock and proven under InnoDB.
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
            $table->foreignId('intended_organization_role_id')->nullable()->constrained('core_roles')->restrictOnDelete();
            $table->foreignId('intended_workspace_role_id')->nullable()->constrained('core_roles')->restrictOnDelete();
            $table->foreignId('invited_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('message', 1000)->nullable();
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
                (type = 'organization' AND organization_id IS NOT NULL AND workspace_id IS NULL AND intended_organization_role_id IS NOT NULL AND intended_workspace_role_id IS NULL)
                OR (type = 'workspace' AND workspace_id IS NOT NULL AND organization_id IS NULL AND intended_workspace_role_id IS NOT NULL AND intended_organization_role_id IS NULL)
                OR (type = 'combined' AND organization_id IS NOT NULL AND workspace_id IS NOT NULL AND intended_organization_role_id IS NOT NULL AND intended_workspace_role_id IS NOT NULL)
            )");
            DB::statement("ALTER TABLE core_invitations ADD CONSTRAINT core_invitations_status_chk CHECK (status IN ('pending', 'accepted', 'revoked'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_invitations');
    }
};
