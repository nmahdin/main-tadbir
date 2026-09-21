<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['project_id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('project_id')->nullable()->change();
            $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
            $table->foreignId('content_id')->nullable()->after('project_id')->constrained('contents')->cascadeOnDelete();
            $table->string('content_stage_id', 120)->nullable()->after('content_id');
            $table->string('kind', 40)->default('general')->after('content_stage_id');
            $table->index(['content_id', 'content_stage_id', 'kind'], 'tasks_content_stage_kind_index');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_content_stage_kind_index');
            $table->dropConstrainedForeignId('content_id');
            $table->dropColumn(['content_stage_id', 'kind']);
            $table->dropForeign(['project_id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('project_id')->nullable(false)->change();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
        });
    }
};
