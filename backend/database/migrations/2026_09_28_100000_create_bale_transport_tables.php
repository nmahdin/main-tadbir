<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bale_user_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('bale_user_id', 32)->unique();
            $table->string('chat_id', 32);
            $table->timestamps();
        });
        Schema::create('bale_link_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('code_hash', 64)->unique();
            $table->timestamp('expires_at')->index();
        });
        Schema::create('bale_inbox', function (Blueprint $table) {
            $table->id();
            $table->string('bot_id', 32);
            $table->unsignedBigInteger('update_id');
            $table->string('status', 20)->default('processed');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['bot_id', 'update_id']);
            // Deliberately no raw payload: a message can contain a live link code.
        });
        Schema::create('bale_outbox', function (Blueprint $table) {
            $table->id();
            $table->string('deduplication_key', 160)->unique();
            $table->string('bot_id', 32);
            $table->foreignId('link_id')->nullable()->constrained('bale_user_links')->nullOnDelete();
            $table->boolean('requires_link')->default(true);
            $table->string('chat_id', 32);
            $table->text('payload'); // encrypted JSON, never included in monitoring responses
            $table->string('subject_type', 30)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('available_at');
            $table->string('error_code', 40)->nullable();
            $table->string('remote_message_id', 40)->nullable();
            $table->timestamps();
            $table->index(['status', 'available_at']);
        });
        Schema::create('bale_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('link_id')->unique()->constrained('bale_user_links')->cascadeOnDelete();
            $table->string('step', 40);
            $table->string('nonce', 32);
            $table->text('data'); // encrypted draft; confirmation and DB mutation are atomic
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bale_conversations');
        Schema::dropIfExists('bale_outbox');
        Schema::dropIfExists('bale_inbox');
        Schema::dropIfExists('bale_link_codes');
        Schema::dropIfExists('bale_user_links');
    }
};
