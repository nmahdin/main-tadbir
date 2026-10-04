<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Remove the one-migration FK support index after its contextual replacement exists. */
return new class extends Migration
{
    private const SUPPORT_INDEX = 'dam_relations_asset_id_repair_index';

    public function up(): void
    {
        if (Schema::hasIndex('dam_relations', self::SUPPORT_INDEX)) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table
                ->dropIndex(self::SUPPORT_INDEX));
        }
    }

    public function down(): void
    {
        if (! Schema::hasIndex('dam_relations', self::SUPPORT_INDEX)) {
            Schema::table('dam_relations', fn (Blueprint $table) => $table
                ->index('asset_id', self::SUPPORT_INDEX));
        }
    }
};
