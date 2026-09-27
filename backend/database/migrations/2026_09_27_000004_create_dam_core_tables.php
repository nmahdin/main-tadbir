<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('dam_folders', function (Blueprint $t) {
            $t->id(); $t->string('name');
            $t->foreignId('parent_id')->nullable()->constrained('dam_folders')->restrictOnDelete();
            $t->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestamps();
            $t->index(['parent_id', 'name']);
        });
        Schema::create('dam_categories', function (Blueprint $t) {
            $t->id(); $t->string('name'); $t->text('description')->nullable();
            $t->foreignId('parent_id')->nullable()->constrained('dam_categories')->restrictOnDelete(); $t->timestamps();
        });
        Schema::create('dam_assets', function (Blueprint $t) {
            $t->id();
            $t->string('type', 10);
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('status', 30)->default('draft');
            $t->string('confidentiality', 20)->default('internal');
            $t->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $t->foreignId('folder_id')->nullable()->constrained('dam_folders')->nullOnDelete();
            $t->foreignId('category_id')->nullable()->constrained('dam_categories')->nullOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps(); $t->softDeletes();
            $t->index(['type', 'status', 'created_at']);
            $t->index(['confidentiality', 'owner_id']);
        });
        Schema::create('dam_files', function (Blueprint $t) {
            $t->id(); $t->foreignId('asset_id')->constrained('dam_assets')->cascadeOnDelete();
            $t->string('original_filename'); $t->string('stored_filename');
            $t->string('extension', 30)->nullable(); $t->string('mime_type', 150);
            $t->unsignedBigInteger('file_size'); $t->string('checksum', 64);
            $t->string('storage_disk', 50); $t->string('storage_path')->unique();
            $t->boolean('is_latest')->default(true); $t->timestamps();
            $t->index(['asset_id', 'is_latest']);
        });
        Schema::create('dam_content_items', function (Blueprint $t) {
            $t->id(); $t->foreignId('asset_id')->unique()->constrained('dam_assets')->cascadeOnDelete();
            $t->string('content_format', 20)->default('plain');
            $t->longText('content_body'); $t->longText('content_plain_text'); $t->timestamps();
        });
        Schema::create('dam_versions', function (Blueprint $t) {
            $t->id(); $t->foreignId('asset_id')->constrained('dam_assets')->cascadeOnDelete();
            $t->unsignedInteger('version_number');
            $t->foreignId('file_id')->nullable()->constrained('dam_files')->nullOnDelete();
            $t->longText('content_snapshot')->nullable();
            $t->text('change_description')->nullable();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestamp('created_at')->useCurrent();
            $t->unique(['asset_id', 'version_number']);
        });
        Schema::create('dam_relations', function (Blueprint $t) {
            $t->id(); $t->foreignId('asset_id')->constrained('dam_assets')->cascadeOnDelete();
            $t->string('related_type', 40); $t->unsignedBigInteger('related_id');
            $t->string('relation_type', 40)->default('attachment');
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->timestamp('created_at')->useCurrent();
            $t->unique(['asset_id', 'related_type', 'related_id', 'relation_type'], 'dam_relations_unique');
            $t->index(['related_type', 'related_id']);
        });
        Schema::create('dam_activities', function (Blueprint $t) {
            $t->id(); $t->foreignId('asset_id')->constrained('dam_assets')->cascadeOnDelete();
            $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->string('action', 50); $t->json('metadata')->nullable(); $t->timestamp('created_at')->useCurrent();
            $t->index(['asset_id', 'created_at']);
        });
    }
    public function down(): void
    {
        foreach (['dam_activities', 'dam_relations', 'dam_versions', 'dam_content_items', 'dam_files', 'dam_assets', 'dam_categories', 'dam_folders'] as $table) Schema::dropIfExists($table);
    }
};
