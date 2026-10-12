<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Explicit, auditable links between canonical DAM records and Google Workspace.
 * Google files never replace the native asset/table; they are optional editors.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('google_workspace_links', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('dam_asset_id')->nullable()->constrained('dam_assets')->cascadeOnDelete();
            $table->foreignId('dam_data_table_id')->nullable()->constrained('dam_data_tables')->cascadeOnDelete();
            $table->string('resource_type', 20); // document | spreadsheet
            $table->string('google_file_id', 255)->unique();
            $table->string('google_file_name');
            $table->string('google_mime_type', 150);
            $table->text('web_url');
            $table->string('remote_version', 100)->nullable();
            $table->timestamp('remote_modified_at')->nullable();
            $table->string('local_fingerprint', 64)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('last_pushed_at')->nullable();
            $table->timestamp('last_pulled_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('dam_asset_id');
            $table->unique('dam_data_table_id');
            $table->index(['resource_type', 'last_synced_at']);
        });

        Schema::create('dam_data_table_versions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('table_id')->constrained('dam_data_tables')->cascadeOnDelete();
            $table->unsignedInteger('version_number');
            $table->string('source', 40)->default('google_workspace');
            $table->longText('snapshot');
            $table->text('change_description')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['table_id', 'version_number']);
            $table->index(['table_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dam_data_table_versions');
        Schema::dropIfExists('google_workspace_links');
    }
};
