<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extend the existing DAM without creating parallel asset/stage stores.
 * Folder ownership is explicit and relation context can point at a stage,
 * output and immutable DAM version while retaining legacy relation_type.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dam_folders', function (Blueprint $table): void {
            $table->string('management_type', 20)->default('user')->after('department_id');
            $table->string('system_key', 191)->nullable()->after('management_type');
            $table->index('management_type', 'dam_folders_management_type_index');
            $table->unique('system_key', 'dam_folders_system_key_unique');
        });

        Schema::table('dam_relations', function (Blueprint $table): void {
            $table->string('stage_id', 120)->nullable()->after('relation_type');
            $table->string('output_id', 120)->nullable()->after('stage_id');
            $table->foreignId('asset_version_id')->nullable()->after('output_id')
                ->constrained('dam_versions')->nullOnDelete();
            // Non-null fingerprint makes relation idempotency work on both MySQL
            // and SQLite (where nullable unique columns have different semantics).
            $table->string('context_key', 191)->default('')->after('asset_version_id');
            $table->json('metadata')->nullable()->after('context_key');
        });

        Schema::table('dam_relations', function (Blueprint $table): void {
            $table->dropUnique('dam_relations_unique');
            $table->unique(
                ['asset_id', 'related_type', 'related_id', 'relation_type', 'context_key'],
                'dam_relations_context_unique',
            );
            $table->index('relation_type', 'dam_relations_relation_type_index');
            $table->index(['stage_id', 'output_id'], 'dam_relations_stage_output_index');
        });

        Schema::table('dam_files', function (Blueprint $table): void {
            $table->index('checksum', 'dam_files_checksum_index');
        });

        Schema::table('dam_assets', function (Blueprint $table): void {
            // owner_id/folder_id are already indexed by their foreign keys.
            $table->index('status', 'dam_assets_status_index');
            $table->index('updated_at', 'dam_assets_updated_index');
        });

        Schema::table('tasks', function (Blueprint $table): void {
            $table->index(
                ['content_id', 'content_stage_id', 'kind', 'status'],
                'tasks_content_stage_kind_status_index',
            );
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table): void {
            $table->dropIndex('tasks_content_stage_kind_status_index');
        });
        Schema::table('dam_assets', function (Blueprint $table): void {
            $table->dropIndex('dam_assets_status_index');
            $table->dropIndex('dam_assets_updated_index');
        });
        Schema::table('dam_files', function (Blueprint $table): void {
            $table->dropIndex('dam_files_checksum_index');
        });
        Schema::table('dam_relations', function (Blueprint $table): void {
            $table->dropUnique('dam_relations_context_unique');
            $table->dropIndex('dam_relations_relation_type_index');
            $table->dropIndex('dam_relations_stage_output_index');
            $table->unique(
                ['asset_id', 'related_type', 'related_id', 'relation_type'],
                'dam_relations_unique',
            );
            $table->dropConstrainedForeignId('asset_version_id');
            $table->dropColumn(['stage_id', 'output_id', 'context_key', 'metadata']);
        });
        Schema::table('dam_folders', function (Blueprint $table): void {
            $table->dropUnique('dam_folders_system_key_unique');
            $table->dropIndex('dam_folders_management_type_index');
            $table->dropColumn(['management_type', 'system_key']);
        });
    }
};
