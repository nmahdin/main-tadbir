<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->string('icon')->nullable();
            $table->string('color', 20)->default('#3b82f6');
            $table->enum('default_priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            $table->unsignedInteger('estimated_duration_days')->default(30);
            $table->string('budget')->nullable();
            $table->json('stages')->nullable();
            $table->json('tasks')->nullable();
            $table->json('tags')->nullable();
            $table->boolean('is_built_in')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_templates');
    }
};

