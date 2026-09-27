<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('dam_tags', function (Blueprint $t) {
            $t->id(); $t->string('name')->unique(); $t->timestamps();
        });
        Schema::create('dam_asset_tag', function (Blueprint $t) {
            $t->foreignId('asset_id')->constrained('dam_assets')->cascadeOnDelete();
            $t->foreignId('tag_id')->constrained('dam_tags')->cascadeOnDelete();
            $t->primary(['asset_id', 'tag_id']);
        });
    }
    public function down(): void
    {
        foreach (['dam_asset_tag','dam_tags'] as $table) Schema::dropIfExists($table);
    }
};
