<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds recurring content series and project planning without replacing the
 * existing Content, Task, Workflow, WorkspaceRecord or DAM domains.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_series', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('code_prefix', 32)->nullable();
            $table->string('content_type', 80);
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('process_template_id', 120)->nullable();
            $table->string('status', 20)->default('active');
            $table->string('recurrence_type', 30)->default('manual');
            $table->json('recurrence_config')->nullable();
            $table->json('default_content_payload')->nullable();
            $table->json('default_publication_config')->nullable();
            $table->unsignedInteger('next_sequence_number')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'updated_at'], 'content_series_status_updated_index');
            $table->index(['project_id', 'status'], 'content_series_project_status_index');
            $table->index(['department_id', 'status'], 'content_series_department_status_index');
        });

        Schema::table('contents', function (Blueprint $table): void {
            $table->foreignId('series_id')->nullable()->after('project_id')->constrained('content_series')->nullOnDelete();
            $table->unsignedInteger('series_sequence')->nullable()->after('series_id');
            $table->string('period_key', 120)->nullable()->after('series_sequence');
            // MySQL and MariaDB permit multiple NULL period/sequence values while
            // still rejecting duplicate concrete occurrences.
            $table->unique(['series_id', 'period_key'], 'contents_series_period_unique');
            $table->unique(['series_id', 'series_sequence'], 'contents_series_sequence_unique');
            $table->index(['series_id', 'created_at'], 'contents_series_created_index');
        });

        Schema::table('workspace_records', function (Blueprint $table): void {
            $table->foreignId('project_id')->nullable()->after('owner_id')->constrained('projects')->nullOnDelete();
            $table->index(['kind', 'project_id', 'created_at'], 'workspace_kind_project_created_index');
        });

        // Preserve already stored optional project links from idea/meeting payloads.
        DB::table('workspace_records')
            ->whereIn('kind', ['idea', 'think_tank_meeting'])
            ->whereNull('project_id')
            ->orderBy('id')
            ->chunkById(200, function ($records): void {
                foreach ($records as $record) {
                    $payload = json_decode((string) $record->payload, true);
                    $projectId = $payload['projectId'] ?? null;
                    if (is_numeric($projectId) && DB::table('projects')->where('id', (int) $projectId)->exists()) {
                        DB::table('workspace_records')->where('id', $record->id)->update(['project_id' => (int) $projectId]);
                    }
                }
            });

        Schema::create('project_content_plans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->string('content_type', 80);
            $table->unsignedInteger('planned_count')->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('default_series_id')->nullable()->constrained('content_series')->nullOnDelete();
            $table->date('deadline')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['project_id', 'content_type'], 'project_content_plan_type_unique');
        });

        Schema::create('series_batch_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('series_id')->constrained('content_series')->cascadeOnDelete();
            $table->uuid('request_key');
            $table->json('content_ids')->nullable();
            $table->timestamps();
            $table->unique(['series_id', 'request_key'], 'series_batch_request_unique');
        });

        Schema::create('content_watchers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('content_id')->constrained('contents')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['content_id', 'user_id'], 'content_watchers_content_user_unique');
            $table->index(['user_id', 'created_at'], 'content_watchers_user_created_index');
        });

        Schema::table('tasks', function (Blueprint $table): void {
            $table->json('context')->nullable()->after('subtasks');
        });
        Schema::table('activity_logs', function (Blueprint $table): void {
            $table->json('metadata')->nullable()->after('details');
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', fn (Blueprint $table) => $table->dropColumn('metadata'));
        Schema::table('tasks', fn (Blueprint $table) => $table->dropColumn('context'));
        Schema::dropIfExists('content_watchers');
        Schema::dropIfExists('series_batch_requests');
        Schema::dropIfExists('project_content_plans');

        Schema::table('workspace_records', function (Blueprint $table): void {
            $table->dropIndex('workspace_kind_project_created_index');
            $table->dropConstrainedForeignId('project_id');
        });
        Schema::table('contents', function (Blueprint $table): void {
            $table->dropIndex('contents_series_created_index');
            $table->dropUnique('contents_series_period_unique');
            $table->dropUnique('contents_series_sequence_unique');
            $table->dropConstrainedForeignId('series_id');
            $table->dropColumn(['series_sequence', 'period_key']);
        });
        Schema::dropIfExists('content_series');
    }
};
