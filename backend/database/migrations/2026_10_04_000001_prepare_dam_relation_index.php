<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Prepare the legacy relation FK before the contextual uniqueness migration.
 *
 * This migration intentionally sorts immediately before 000002. InnoDB may use
 * dam_relations_unique as the only supporting index for asset_id, so attempting
 * to drop it before its replacement exists raises MySQL error 1553.
 *
 * MySQL commits DDL implicitly. An installation that already attempted 000002
 * can therefore have its columns without a migration-log row. In that precise
 * state, remove only those uncommitted additions so Laravel can safely rerun the
 * original migration from the beginning. Installations where 000002 completed
 * are never altered by this recovery path.
 */
return new class extends Migration
{
    private const TARGET_MIGRATION = '2026_10_04_000002_harden_dam_contexts_and_indexes';
    private const SUPPORT_INDEX = 'dam_relations_asset_id_repair_index';

    public function up(): void
    {
        $targetCompleted = Schema::hasTable('migrations')
            && DB::table('migrations')->where('migration', self::TARGET_MIGRATION)->exists();

        if ($targetCompleted) {
            return;
        }

        // Add this before any recovery cleanup as the contextual index itself
        // may currently be the only index supporting the asset foreign key.
        if (! Schema::hasIndex('dam_relations', self::SUPPORT_INDEX)) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table
                ->index('asset_id', self::SUPPORT_INDEX));
        }

        $partiallyApplied = Schema::hasColumn('dam_folders', 'management_type')
            || Schema::hasColumn('dam_folders', 'system_key')
            || Schema::hasColumn('dam_relations', 'stage_id')
            || Schema::hasColumn('dam_relations', 'output_id')
            || Schema::hasColumn('dam_relations', 'asset_version_id')
            || Schema::hasColumn('dam_relations', 'context_key')
            || Schema::hasColumn('dam_relations', 'metadata');

        if ($partiallyApplied) {
            $this->removePartialTargetMigration();
        }
    }

    public function down(): void
    {
        // 000002's rollback recreates dam_relations_unique before this executes,
        // so the FK remains supported while the temporary index is removed.
        if (Schema::hasIndex('dam_relations', self::SUPPORT_INDEX)) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table
                ->dropIndex(self::SUPPORT_INDEX));
        }
    }

    private function removePartialTargetMigration(): void
    {
        foreach ([
            ['tasks', 'tasks_content_stage_kind_status_index'],
            ['dam_assets', 'dam_assets_status_index'],
            ['dam_assets', 'dam_assets_updated_index'],
            ['dam_files', 'dam_files_checksum_index'],
        ] as [$tableName, $indexName]) {
            if (Schema::hasIndex($tableName, $indexName)) {
                Schema::table($tableName, fn (Blueprint $table) => $table->dropIndex($indexName));
            }
        }

        foreach (['dam_relations_context_unique', 'dam_relations_relation_type_index', 'dam_relations_stage_output_index'] as $index) {
            if (Schema::hasIndex('dam_relations', $index)) {
                Schema::table('dam_relations', function (Blueprint $table) use ($index): void {
                    str_ends_with($index, '_unique') ? $table->dropUnique($index) : $table->dropIndex($index);
                });
            }
        }

        if (! Schema::hasIndex('dam_relations', 'dam_relations_unique')) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table->unique(
                ['asset_id', 'related_type', 'related_id', 'relation_type'],
                'dam_relations_unique',
            ));
        }

        if (Schema::hasColumn('dam_relations', 'asset_version_id')) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table
                ->dropConstrainedForeignId('asset_version_id'));
        }
        $relationColumns = array_values(array_filter(
            ['stage_id', 'output_id', 'context_key', 'metadata'],
            fn (string $column) => Schema::hasColumn('dam_relations', $column),
        ));
        if ($relationColumns !== []) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table->dropColumn($relationColumns));
        }

        if (Schema::hasIndex('dam_folders', 'dam_folders_system_key_unique')) {
            Schema::table('dam_folders', fn (Blueprint $table) => $table
                ->dropUnique('dam_folders_system_key_unique'));
        }
        if (Schema::hasIndex('dam_folders', 'dam_folders_management_type_index')) {
            Schema::table('dam_folders', fn (Blueprint $table) => $table
                ->dropIndex('dam_folders_management_type_index'));
        }
        $folderColumns = array_values(array_filter(
            ['management_type', 'system_key'],
            fn (string $column) => Schema::hasColumn('dam_folders', $column),
        ));
        if ($folderColumns !== []) {
            Schema::table('dam_folders', fn (Blueprint $table) => $table->dropColumn($folderColumns));
        }
    }
};
