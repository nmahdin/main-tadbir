<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->enum('status', ['backlog', 'todo', 'in_progress', 'review', 'completed'])->default('backlog');
            $table->date('start_date')->nullable();
            $table->date('deadline')->nullable();
            $table->unsignedInteger('estimated_hours')->default(0);
            $table->unsignedInteger('logged_hours')->default(0);
            $table->json('tags')->nullable();
            $table->json('dependencies')->nullable();
            $table->boolean('is_blocked')->default(false);
            $table->text('blocked_reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};

