<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // -------- CORE-REQ: core_action_items -------------------------
        Schema::create('core_action_items', function (Blueprint $table): void {
            $table->id();
            $table->string('origin_module', 40);
            $table->string('origin_type', 60);
            $table->unsignedBigInteger('origin_id');
            $table->string('action_kind', 20);
            $table->string('title', 200);
            $table->string('summary', 500)->nullable();
            $table->string('deep_link', 500)->nullable();
            $table->string('urgency', 16);
            $table->timestamp('due_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->string('resolved_by_module', 60)->nullable();
            $table->unsignedBigInteger('resolved_by_user_id')->nullable();
            $table->unsignedBigInteger('recipient_user_id')->nullable();
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('assigned_user_id')->nullable();
            $table->json('allowed_actions')->default('[]');
            $table->json('origin_context')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(
                ['origin_module', 'origin_type', 'origin_id', 'recipient_user_id', 'organization_id'],
                'action_items_origin_recipient_uniq'
            );
            $table->index(['recipient_user_id', 'action_kind', 'resolved_at'], 'action_items_user_kind_idx');
            $table->index(['organization_id', 'action_kind', 'resolved_at'], 'action_items_org_kind_idx');
            $table->index(['origin_module', 'origin_type', 'origin_id'], 'action_items_origin_idx');
            $table->index(['due_at'], 'action_items_due_idx');
        });

        Schema::table('core_action_items', function (Blueprint $table): void {
            $table->foreign('resolved_by_user_id', 'action_items_resolver_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->foreign('recipient_user_id', 'action_items_recipient_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->foreign('organization_id', 'action_items_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
            $table->foreign('assigned_user_id', 'action_items_assigned_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });

        // -------- SYS-MSG: core_system_messages -----------------------
        Schema::create('core_system_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 100);
            $table->unsignedInteger('version')->default(1);
            $table->string('audience', 20);
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->string('title', 200);
            $table->longText('body_markdown');
            $table->string('cta_label', 120)->default('Learn more');
            $table->string('cta_link', 1000)->nullable();
            $table->string('category', 60)->nullable();
            $table->string('status', 20)->default('draft');
            $table->boolean('ack_required')->default(false);
            $table->string('ack_policy_version', 64)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('retired_at')->nullable();
            $table->unsignedBigInteger('published_by_user_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['slug', 'version'], 'sys_msg_slug_version_uniq');
            $table->index(['status', 'published_at'], 'sys_msg_active_idx');
        });

        Schema::table('core_system_messages', function (Blueprint $table): void {
            $table->foreign('organization_id', 'sys_msg_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
            $table->foreign('published_by_user_id', 'sys_msg_published_by_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('core_system_message_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('message_id');
            $table->unsignedInteger('version');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->char('ack_evidence_hash', 64)->nullable();
            $table->timestamp('first_delivered_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['message_id', 'version', 'user_id'], 'sys_msg_delivery_uniq');
            $table->index(['user_id', 'read_at'], 'sys_msg_user_read_idx');
            $table->index(['user_id', 'acknowledged_at'], 'sys_msg_user_ack_idx');
        });

        Schema::table('core_system_message_deliveries', function (Blueprint $table): void {
            $table->foreign('message_id', 'sys_msg_delivery_message_foreign')
                ->references('id')->on('core_system_messages')->cascadeOnDelete();
            $table->foreign('user_id', 'sys_msg_delivery_user_foreign')
                ->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('organization_id', 'sys_msg_delivery_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
        });

        // -------- SUP: core_support_tickets ---------------------------
        Schema::create('core_support_tickets', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 20);
            $table->string('subject', 200);
            $table->string('category', 40);
            $table->string('status', 20);
            $table->string('priority', 16);
            $table->unsignedBigInteger('owner_user_id');
            $table->unsignedBigInteger('assigned_user_id')->nullable();
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('last_replied_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique('reference', 'support_tickets_reference_uniq');
            $table->index(['owner_user_id', 'status', 'created_at'], 'support_tickets_owner_idx');
            $table->index(['status', 'priority', 'created_at'], 'support_tickets_queue_idx');
            $table->index(['assigned_user_id', 'status'], 'support_tickets_assignee_idx');
        });

        Schema::table('core_support_tickets', function (Blueprint $table): void {
            $table->foreign('owner_user_id', 'support_tickets_owner_foreign')
                ->references('id')->on('users')->restrictOnDelete();
            $table->foreign('assigned_user_id', 'support_tickets_assignee_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->foreign('organization_id', 'support_tickets_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
        });

        Schema::create('core_support_messages', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('ticket_id');
            $table->unsignedBigInteger('author_user_id');
            $table->string('author_role', 20);
            $table->longText('body');
            $table->boolean('internal_note')->default(false);
            $table->json('attachments')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['ticket_id', 'internal_note', 'created_at'], 'support_msgs_ticket_idx');
        });

        Schema::table('core_support_messages', function (Blueprint $table): void {
            $table->foreign('ticket_id', 'support_msgs_ticket_foreign')
                ->references('id')->on('core_support_tickets')->cascadeOnDelete();
            $table->foreign('author_user_id', 'support_msgs_author_foreign')
                ->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('core_support_attachments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('ticket_id');
            $table->unsignedBigInteger('uploader_user_id');
            $table->string('storage_disk', 40)->default('local');
            $table->string('storage_path', 500);
            $table->string('original_name', 255);
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->char('access_token', 64);
            $table->timestamp('accessed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique('access_token', 'support_att_token_uniq');
            $table->index(['ticket_id'], 'support_att_ticket_idx');
        });

        Schema::table('core_support_attachments', function (Blueprint $table): void {
            $table->foreign('ticket_id', 'support_att_ticket_foreign')
                ->references('id')->on('core_support_tickets')->cascadeOnDelete();
            $table->foreign('uploader_user_id', 'support_att_uploader_foreign')
                ->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('core_support_activity', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('ticket_id');
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->string('event_type', 60);
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['ticket_id', 'created_at'], 'support_activity_ticket_idx');
        });

        Schema::table('core_support_activity', function (Blueprint $table): void {
            $table->foreign('ticket_id', 'support_activity_ticket_foreign')
                ->references('id')->on('core_support_tickets')->cascadeOnDelete();
            $table->foreign('actor_user_id', 'support_activity_actor_foreign')
                ->references('id')->on('users')->nullOnDelete();
        });

        // CHECK constraints (MySQL 8 / MariaDB; skipped on SQLite for tests).
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->addCheckIfMissing('core_action_items', 'action_items_recipient_scope_check',
                "((recipient_user_id IS NOT NULL AND organization_id IS NULL) OR (recipient_user_id IS NULL AND organization_id IS NOT NULL))");
            $this->addCheckIfMissing('core_action_items', 'action_items_urgency_check',
                "urgency IN ('info','normal','high','critical')");
            $this->addCheckIfMissing('core_action_items', 'action_items_kind_check',
                "action_kind IN ('open','blocked','overdue','resolved')");
            $this->addCheckIfMissing('core_support_tickets', 'support_tickets_status_check',
                "status IN ('new','open','pending_reply','pending_user','resolved','closed')");
            $this->addCheckIfMissing('core_support_tickets', 'support_tickets_priority_check',
                "priority IN ('low','normal','high','urgent')");
            $this->addCheckIfMissing('core_support_messages', 'support_msgs_author_role_check',
                "author_role IN ('requester','agent','system')");
        }
    }

    private function addCheckIfMissing(string $table, string $constraint, string $expression): void
    {
        $exists = DB::table('information_schema.TABLE_CONSTRAINTS')
            ->where('CONSTRAINT_SCHEMA', DB::connection()->getDatabaseName())
            ->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $constraint)
            ->where('CONSTRAINT_TYPE', 'CHECK')
            ->exists();
        if ($exists) {
            return;
        }
        DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$constraint} CHECK ({$expression})");
    }

    public function down(): void
    {
        Schema::dropIfExists('core_support_activity');
        Schema::dropIfExists('core_support_attachments');
        Schema::dropIfExists('core_support_messages');
        Schema::dropIfExists('core_support_tickets');
        Schema::dropIfExists('core_system_message_deliveries');
        Schema::dropIfExists('core_system_messages');
        Schema::dropIfExists('core_action_items');
    }
};
