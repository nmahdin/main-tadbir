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
            $table->foreign('resolved_by_user_id', 'action_items_resolver_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->foreign('organization_id', 'action_items_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
            $table->unsignedBigInteger('assigned_user_id')->nullable();
            $table->foreign('assigned_user_id', 'action_items_assigned_foreign')
                ->references('id')->on('users')->nullOnDelete();
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

        // -------- SYS-MSG: core_system_messages -----------------------
        Schema::create('core_system_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 100);
            $table->unsignedInteger('version')->default(1);
            $table->string('audience', 20);           // platform|organization|personal
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->foreign('organization_id', 'sys_msg_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
            $table->string('title', 200);
            $table->longText('body_markdown');
            $table->string('cta_label', 120)->default('Learn more');
            $table->string('cta_link', 1000)->nullable();
            $table->string('category', 60)->nullable();
            $table->string('status', 20)->default('draft'); // draft|published|retired
            $table->boolean('ack_required')->default(false);
            $table->string('ack_policy_version', 64)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('retired_at')->nullable();
            $table->unsignedBigInteger('published_by_user_id')->nullable();
            $table->foreign('published_by_user_id', 'sys_msg_published_by_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->unique(['slug', 'version'], 'sys_msg_slug_version_uniq');
            $table->index(['status', 'published_at'], 'sys_msg_active_idx');
        });

        Schema::create('core_system_message_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('message_id')->constrained('core_system_messages')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
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

        // -------- SUP: core_support_tickets ---------------------------
        Schema::create('core_support_tickets', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 20)->unique();
            $table->string('subject', 200);
            $table->string('category', 40);
            $table->string('status', 20);
            $table->string('priority', 16);
            $table->foreignId('owner_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('assigned_user_id')->nullable();
            $table->foreign('assigned_user_id', 'support_tickets_assignee_foreign')
                ->references('id')->on('users')->nullOnDelete();
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->foreign('organization_id', 'support_tickets_org_foreign')
                ->references('id')->on('organizations')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('last_replied_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['owner_user_id', 'status', 'created_at'], 'support_tickets_owner_idx');
            $table->index(['status', 'priority', 'created_at'], 'support_tickets_queue_idx');
            $table->index(['assigned_user_id', 'status'], 'support_tickets_assignee_idx');
        });

        Schema::create('core_support_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('ticket_id')->constrained('core_support_tickets')->cascadeOnDelete();
            $table->foreignId('author_user_id')->constrained('users')->restrictOnDelete();
            $table->string('author_role', 20);   // requester|agent|system
            $table->longText('body');
            $table->boolean('internal_note')->default(false);
            $table->json('attachments')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['ticket_id', 'internal_note', 'created_at'], 'support_msgs_ticket_idx');
        });

        Schema::create('core_support_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('ticket_id')->constrained('core_support_tickets')->cascadeOnDelete();
            $table->foreignId('uploader_user_id')->constrained('users')->restrictOnDelete();
            $table->string('storage_disk', 40)->default('private');
            $table->string('storage_path', 500);
            $table->string('original_name', 255);
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->char('access_token', 64)->unique();
            $table->timestamp('accessed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index(['ticket_id'], 'support_att_ticket_idx');
        });

        Schema::create('core_support_activity', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('ticket_id')->constrained('core_support_tickets')->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 60);
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['ticket_id', 'created_at'], 'support_activity_ticket_idx');
        });

        // CHECK constraints (MySQL 8 / MariaDB; skipped on SQLite for tests).
        $driver = DB::connection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_action_items ADD CONSTRAINT action_items_recipient_scope_check CHECK (
                (recipient_user_id IS NOT NULL AND organization_id IS NULL) OR
                (recipient_user_id IS NULL AND organization_id IS NOT NULL)
            )");
            DB::statement("ALTER TABLE core_action_items ADD CONSTRAINT action_items_urgency_check CHECK (
                urgency IN ('info','normal','high','critical')
            )");
            DB::statement("ALTER TABLE core_action_items ADD CONSTRAINT action_items_kind_check CHECK (
                action_kind IN ('open','blocked','overdue','resolved')
            )");
            DB::statement("ALTER TABLE core_support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (
                status IN ('new','open','pending_reply','pending_user','resolved','closed')
            )");
            DB::statement("ALTER TABLE core_support_tickets ADD CONSTRAINT support_tickets_priority_check CHECK (
                priority IN ('low','normal','high','urgent')
            )");
            DB::statement("ALTER TABLE core_support_messages ADD CONSTRAINT support_msgs_author_role_check CHECK (
                author_role IN ('requester','agent','system')
            )");
        }
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
