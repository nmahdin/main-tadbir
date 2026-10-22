<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * UX-02-4: additive notification-experience columns on domain_records
 * (read_at / category_key / group_key accelerators; payload stays the
 * source of content) and the notification_archives table used by the
 * 90-day retention command. Nullable + reversible; no data rewrite;
 * MariaDB 10.4-safe (no CHECK constraints, no strict-mode changes).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domain_records', function (Blueprint $table) {
            $table->dateTime('read_at')->nullable();
            $table->string('category_key', 40)->nullable();
            $table->string('group_key', 120)->nullable();
            $table->index(['domain', 'user_id', 'read_at', 'id'], 'ix_notif_inbox');
            $table->index(['domain', 'user_id', 'group_key', 'id'], 'ix_notif_group');
            $table->index(['domain', 'created_at'], 'ix_notif_retention');
        });

        Schema::create('notification_archives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notification_key', 64)->nullable();
            $table->json('payload');
            $table->dateTime('original_created_at')->nullable();
            // DATETIME (not TIMESTAMP): MariaDB legacy explicit_defaults OFF
            // would silently add ON UPDATE CURRENT_TIMESTAMP.
            $table->dateTime('archived_at');
            $table->index(['user_id', 'archived_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_archives');
        Schema::table('domain_records', function (Blueprint $table) {
            $table->dropIndex('ix_notif_inbox');
            $table->dropIndex('ix_notif_group');
            $table->dropIndex('ix_notif_retention');
            $table->dropColumn(['read_at', 'category_key', 'group_key']);
        });
    }
};
