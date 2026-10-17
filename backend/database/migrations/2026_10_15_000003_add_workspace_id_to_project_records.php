<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 04B — explicit workspace ownership for project records.
 *
 * Adds nullable workspace_id to the operational records the Projects
 * pilot owns or stamps: projects, project_content_plans, and tasks
 * (tasks receive it from their project in project flows; the Tasks
 * module's own endpoints are a Stage 05 slice). Nullable because
 * pre-existing development rows are legacy-mode records (workspace-
 * less): the pilot's firewall keeps them reachable only through the
 * legacy path, and workspace-owned records only through the central
 * authorization path. New scoped writes always set the column.
 *
 * restrictOnDelete matches the Core ownership spine (ADR-0009): a
 * workspace with project records cannot be deleted out from under
 * them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->foreignId('workspace_id')->nullable()->after('id')
                ->constrained('workspaces')->restrictOnDelete();
            $table->index(['workspace_id', 'status']);
        });

        Schema::table('project_content_plans', function (Blueprint $table): void {
            $table->foreignId('workspace_id')->nullable()->after('project_id')
                ->constrained('workspaces')->restrictOnDelete();
            $table->index(['workspace_id', 'project_id']);
        });

        Schema::table('tasks', function (Blueprint $table): void {
            $table->foreignId('workspace_id')->nullable()->after('project_id')
                ->constrained('workspaces')->restrictOnDelete();
            $table->index(['workspace_id', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('workspace_id');
        });

        Schema::table('project_content_plans', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('workspace_id');
        });

        Schema::table('projects', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('workspace_id');
        });
    }
};
