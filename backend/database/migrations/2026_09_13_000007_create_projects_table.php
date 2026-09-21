<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('key', 10)->unique();
            $table->text('description')->nullable();
            $table->foreignId('project_manager_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('start_date')->nullable();
            $table->date('deadline')->nullable();
            $table->enum('status', ['planning', 'active', 'on_hold', 'completed', 'cancelled'])->default('planning');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->json('tags')->nullable();
            $table->string('color', 20)->default('#3b82f6');
            $table->string('budget')->nullable();
            $table->string('category')->nullable();
            $table->foreignId('template_id')->nullable()->constrained('project_templates')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('project_user', function (Blueprint $table) {
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('joined_at')->useCurrent();
            $table->primary(['project_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_user');
        Schema::dropIfExists('projects');
    }
};

