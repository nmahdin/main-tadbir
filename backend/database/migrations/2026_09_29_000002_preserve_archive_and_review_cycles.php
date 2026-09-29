<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['projects', 'tasks', 'contents'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->string('previous_status', 80)->nullable());
        }
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('parent_task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->string('source_key', 64)->nullable()->unique();
            $table->uuid('source_event_id')->nullable();
            $table->json('subtasks')->nullable();
            $table->index(['kind', 'assignee_id', 'status', 'id'], 'tasks_review_queue_index');
        });
    }

    public function down(): void
    {
        // Do not drop durable archive/correction history in an automated rollback.
        // Restore a coordinated backup if a schema rollback is genuinely required.
    }
};
